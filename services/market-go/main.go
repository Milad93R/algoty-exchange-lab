package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gorilla/websocket"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var pairs = []string{"BTCUSDT", "ETHUSDT", "SOLUSDT"}

type Level struct {
	Price    int64 `json:"price"`
	Quantity int64 `json:"quantity"`
}
type Tick struct {
	ID         int64 `json:"id"`
	Time       int64 `json:"time"`
	Price      int64 `json:"price"`
	Quantity   int64 `json:"quantity"`
	BuyerMaker bool  `json:"buyerMaker"`
}
type Candle struct {
	Time   int64   `json:"time"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
	Closed bool    `json:"closed"`
}
type Market struct {
	Symbol    string   `json:"symbol"`
	Source    string   `json:"source"`
	Bids      []Level  `json:"bids"`
	Asks      []Level  `json:"asks"`
	Trades    []Tick   `json:"trades"`
	Candles   []Candle `json:"candles"`
	Updated   int64    `json:"updated"`
	Sequence  int64    `json:"sequence"`
	Stale     bool     `json:"stale"`
	Connected bool     `json:"connected"`
}
type Execute struct {
	ID             string `json:"id"`
	Account        string `json:"account"`
	Symbol         string `json:"symbol"`
	Side           string `json:"side"`
	Kind           string `json:"kind,omitempty"`
	Price          int64  `json:"price"`
	StopPrice      int64  `json:"stopPrice,omitempty"`
	StopLimitPrice int64  `json:"stopLimitPrice,omitempty"`
	ActiveLeg      string `json:"activeLeg,omitempty"`
	Quantity       int64  `json:"quantity"`
	After          int64  `json:"after"`
	Resting        bool   `json:"resting"`
}
type Fill struct {
	Price    int64  `json:"price"`
	Quantity int64  `json:"quantity"`
	Evidence string `json:"evidence"`
}
type Receipt struct {
	Request  Execute `json:"request"`
	Fills    []Fill  `json:"fills"`
	Leg      string  `json:"leg,omitempty"`
	At       int64   `json:"at"`
	Sequence int64   `json:"sequence"`
	Model    string  `json:"model"`
}
type Persistent struct {
	Results map[string]Receipt `json:"results"`
	Used    map[string]int64   `json:"used"`
}
type Feed struct {
	mu      sync.Mutex
	markets map[string]*Market
	state   Persistent
	path    string
}

func decimal(s string, scale float64) int64 {
	f, _ := strconv.ParseFloat(s, 64)
	if scale == 1000000 {
		return int64(math.Floor(f*scale + 1e-8))
	}
	return int64(math.Round(f * scale))
}
func number(s string) float64 { f, _ := strconv.ParseFloat(s, 64); return f }
func newFeed(path string) *Feed {
	f := &Feed{markets: map[string]*Market{}, path: path, state: Persistent{Results: map[string]Receipt{}, Used: map[string]int64{}}}
	if path != "" {
		if b, e := os.ReadFile(path); e == nil {
			if json.Unmarshal(b, &f.state) != nil {
				log.Fatal("invalid execution snapshot")
			}
		}
	}
	for _, s := range pairs {
		f.markets[s] = &Market{Symbol: s, Source: "Binance public market data", Bids: []Level{}, Asks: []Level{}, Trades: []Tick{}, Candles: []Candle{}, Stale: true}
	}
	return f
}
func (f *Feed) save() error {
	if f.path == "" {
		return nil
	}
	b, e := json.Marshal(f.state)
	if e != nil {
		return e
	}
	os.MkdirAll(filepath.Dir(f.path), 0700)
	file, e := os.CreateTemp(filepath.Dir(f.path), "exec-")
	if e != nil {
		return e
	}
	defer os.Remove(file.Name())
	if _, e = file.Write(b); e == nil {
		e = file.Sync()
	}
	file.Close()
	if e != nil {
		return e
	}
	if e = os.Rename(file.Name(), f.path); e != nil {
		return e
	}
	d, e := os.Open(filepath.Dir(f.path))
	if e != nil {
		return e
	}
	defer d.Close()
	return d.Sync()
}
func (f *Feed) view(symbol string) (Market, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, ok := f.markets[symbol]
	if !ok {
		return Market{}, errors.New("unknown market")
	}
	c := *m
	c.Stale = !m.Connected || time.Now().UnixMilli()-m.Updated > 4000
	return c, nil
}
func (f *Feed) execute(q Execute) (Receipt, error) { return f.executeMode(q, false) }
func (f *Feed) executeMode(q Execute, cancel bool) (Receipt, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if old, ok := f.state.Results[q.ID]; ok {
		if old.Request != q {
			return Receipt{}, errors.New("idempotency conflict")
		}
		return old, nil
	}
	m, ok := f.markets[q.Symbol]
	if !ok || (!cancel && (!m.Connected || time.Now().UnixMilli()-m.Updated > 4000)) {
		return Receipt{}, errors.New("market feed is stale")
	}
	isOCO := q.Kind == "OCO"
	validOCO := !isOCO || (q.StopPrice >= 1 && q.StopPrice <= 100000000 && q.StopLimitPrice >= 1 && q.StopLimitPrice <= 100000000 && (q.ActiveLeg == "" || q.ActiveLeg == "LIMIT" || q.ActiveLeg == "STOP_LIMIT") && ((q.Side == "SELL" && q.StopLimitPrice <= q.StopPrice && q.StopPrice < q.Price) || (q.Side == "BUY" && q.Price < q.StopPrice && q.StopPrice <= q.StopLimitPrice)))
	if len(q.ID) < 8 || q.Account == "" || q.Quantity < 1 || q.Quantity > 1000000000 || q.Price < 1 || q.Price > 100000000 || (q.Side != "BUY" && q.Side != "SELL") || (q.Kind != "" && !isOCO) || !validOCO {
		return Receipt{}, errors.New("invalid execution")
	}
	r := Receipt{Request: q, Fills: []Fill{}, At: time.Now().UnixMilli(), Sequence: m.Sequence, Model: "depth-sweep; resting trade-through with observed-volume cap"}
	remaining := q.Quantity
	changed := map[string]int64{}
	consume := func(price, qty int64, key string) {
		available := qty - f.state.Used[key]
		if available < 1 || remaining < 1 {
			return
		}
		n := min(available, remaining)
		changed[key] = f.state.Used[key]
		f.state.Used[key] += n
		remaining -= n
		r.Fills = append(r.Fills, Fill{price, n, key})
	}
	tradeThrough := func(price int64, t Tick) {
		if (q.Side == "BUY" && t.BuyerMaker && t.Price < price) || (q.Side == "SELL" && !t.BuyerMaker && t.Price > price) {
			consume(price, t.Quantity, fmt.Sprintf("%s|%s|t%d", q.Account, q.Symbol, t.ID))
		}
	}
	depthSweep := func(price int64) {
		levels := m.Asks
		if q.Side == "SELL" {
			levels = m.Bids
		}
		for _, l := range levels {
			if (q.Side == "BUY" && l.Price <= price) || (q.Side == "SELL" && l.Price >= price) {
				consume(l.Price, l.Quantity, fmt.Sprintf("%s|%s|%d|%s|%d", q.Account, q.Symbol, m.Sequence, q.Side, l.Price))
			}
		}
	}
	if cancel {
		// A durable empty receipt resolves an unexecuted command even during feed loss.
	} else if isOCO {
		r.Model = "linked OCO; first limit fill or stop trigger cancels the other leg"
		r.Leg = q.ActiveLeg
		for _, t := range m.Trades {
			if t.Time <= q.After {
				continue
			}
			if r.Leg == "LIMIT" {
				tradeThrough(q.Price, t)
				continue
			}
			if r.Leg == "STOP_LIMIT" {
				tradeThrough(q.StopLimitPrice, t)
				continue
			}
			stopTriggered := (q.Side == "SELL" && t.Price <= q.StopPrice) || (q.Side == "BUY" && t.Price >= q.StopPrice)
			if stopTriggered {
				r.Leg = "STOP_LIMIT"
				break
			}
			before := remaining
			tradeThrough(q.Price, t)
			if remaining < before {
				r.Leg = "LIMIT"
			}
		}
		// A newly triggered stop-limit enters against the current observed book.
		// If it is outside the book it rests and later requires a strict trade-through.
		if q.ActiveLeg == "" && r.Leg == "STOP_LIMIT" {
			depthSweep(q.StopLimitPrice)
		}
	} else if q.Resting {
		for _, t := range m.Trades {
			if t.Time <= q.After {
				continue
			}
			tradeThrough(q.Price, t)
		}
	} else {
		depthSweep(q.Price)
	}
	f.state.Results[q.ID] = r
	if e := f.save(); e != nil {
		delete(f.state.Results, q.ID)
		for k, v := range changed {
			f.state.Used[k] = v
		}
		return Receipt{}, e
	}
	return r, nil
}

// Binance uses distinct upper/lowercase keys (t/T, l/L, v/V). Map lookup is
// intentionally case-sensitive; Go's struct fallback would conflate them.
func decodeCandle(raw []byte) (Candle, error) {
	var envelope struct {
		K map[string]json.RawMessage `json:"k"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return Candle{}, err
	}
	var c Candle
	if err := json.Unmarshal(envelope.K["t"], &c.Time); err != nil {
		return c, err
	}
	for key, dest := range map[string]*float64{"o": &c.Open, "h": &c.High, "l": &c.Low, "c": &c.Close, "v": &c.Volume} {
		var value string
		if err := json.Unmarshal(envelope.K[key], &value); err != nil {
			return c, err
		}
		n, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return c, err
		}
		*dest = n
	}
	err := json.Unmarshal(envelope.K["x"], &c.Closed)
	return c, err
}
func (f *Feed) bootstrap() {
	client := http.Client{Timeout: 10 * time.Second}
	for _, s := range pairs {
		r, e := client.Get("https://data-api.binance.vision/api/v3/klines?symbol=" + s + "&interval=1m&limit=240")
		if e != nil {
			continue
		}
		var rows [][]json.RawMessage
		json.NewDecoder(io.LimitReader(r.Body, 2000000)).Decode(&rows)
		r.Body.Close()
		cs := []Candle{}
		for _, row := range rows {
			if len(row) < 7 {
				continue
			}
			var t, end int64
			json.Unmarshal(row[0], &t)
			json.Unmarshal(row[6], &end)
			str := func(i int) string { var v string; json.Unmarshal(row[i], &v); return v }
			cs = append(cs, Candle{t, number(str(1)), number(str(2)), number(str(3)), number(str(4)), number(str(5)), end < time.Now().UnixMilli()})
		}
		f.mu.Lock()
		f.markets[s].Candles = cs
		f.mu.Unlock()
	}
}
func (f *Feed) stream() {
	for {
		f.bootstrap()
		streams := []string{}
		for _, s := range pairs {
			for _, channel := range []string{"depth20@100ms", "aggTrade", "kline_1m"} {
				streams = append(streams, strings.ToLower(s)+"@"+channel)
			}
		}
		c, _, err := websocket.DefaultDialer.Dial("wss://data-stream.binance.vision:443/stream?streams="+strings.Join(streams, "/"), nil)
		if err != nil {
			log.Print("feed reconnect: ", err)
			time.Sleep(3 * time.Second)
			continue
		}
		for {
			c.SetReadDeadline(time.Now().Add(15 * time.Second))
			_, b, e := c.ReadMessage()
			if e != nil {
				break
			}
			var envelope struct {
				Stream string          `json:"stream"`
				Data   json.RawMessage `json:"data"`
			}
			if json.Unmarshal(b, &envelope) != nil {
				continue
			}
			symbol := strings.ToUpper(strings.Split(envelope.Stream, "@")[0])
			f.mu.Lock()
			m := f.markets[symbol]
			if m == nil {
				f.mu.Unlock()
				continue
			}
			if strings.Contains(envelope.Stream, "@depth") {
				var d struct {
					Last int64      `json:"lastUpdateId"`
					Bids [][]string `json:"bids"`
					Asks [][]string `json:"asks"`
				}
				if json.Unmarshal(envelope.Data, &d) == nil && d.Last >= m.Sequence {
					convert := func(rows [][]string) []Level {
						ls := []Level{}
						for _, r := range rows {
							if len(r) >= 2 {
								ls = append(ls, Level{decimal(r[0], 100), int64(math.Floor(number(r[1]) * 1e6))})
							}
						}
						return ls
					}
					m.Bids = convert(d.Bids)
					m.Asks = convert(d.Asks)
					m.Sequence = d.Last
					m.Updated = time.Now().UnixMilli()
					m.Connected = true
				}
			}
			if strings.Contains(envelope.Stream, "@aggTrade") {
				var d struct {
					ID       int64  `json:"a"`
					Time     int64  `json:"T"`
					Price    string `json:"p"`
					Quantity string `json:"q"`
					Maker    bool   `json:"m"`
				}
				if json.Unmarshal(envelope.Data, &d) == nil {
					if len(m.Trades) == 0 || d.ID > m.Trades[len(m.Trades)-1].ID {
						m.Trades = append(append([]Tick{}, m.Trades...), Tick{d.ID, d.Time, decimal(d.Price, 100), decimal(d.Quantity, 1e6), d.Maker})
						if len(m.Trades) > 1000 {
							m.Trades = m.Trades[len(m.Trades)-1000:]
						}
					}
				}
			}
			if strings.Contains(envelope.Stream, "@kline") {
				if v, err := decodeCandle(envelope.Data); err == nil {
					cs := append([]Candle{}, m.Candles...)
					if len(cs) > 0 && cs[len(cs)-1].Time == v.Time {
						cs[len(cs)-1] = v
					} else {
						cs = append(cs, v)
					}
					if len(cs) > 300 {
						cs = cs[len(cs)-300:]
					}
					m.Candles = cs
				}
			}
			f.mu.Unlock()
		}
		c.Close()
		f.mu.Lock()
		for _, m := range f.markets {
			m.Connected = false
		}
		f.mu.Unlock()
		time.Sleep(time.Second)
	}
}

// Only obsolete snapshots/trades can be forgotten. Current liquidity stays consumed.
func (f *Feed) pruneUsed() {
	for key := range f.state.Used {
		parts := strings.Split(key, "|")
		if len(parts) < 3 {
			continue
		}
		m, ok := f.markets[parts[1]]
		if !ok || !m.Connected {
			continue
		}
		if strings.HasPrefix(parts[2], "t") {
			id, _ := strconv.ParseInt(parts[2][1:], 10, 64)
			if len(m.Trades) > 0 && id < m.Trades[0].ID {
				delete(f.state.Used, key)
			}
		} else {
			seq, _ := strconv.ParseInt(parts[2], 10, 64)
			if seq < m.Sequence {
				delete(f.state.Used, key)
			}
		}
	}
}
func main() {
	f := newFeed(os.Getenv("EXECUTION_STATE"))
	go f.stream()
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "UP"})
	})
	http.HandleFunc("/market", func(w http.ResponseWriter, r *http.Request) {
		m, e := f.view(r.URL.Query().Get("symbol"))
		if e != nil {
			http.Error(w, e.Error(), 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(m)
	})
	http.HandleFunc("/execute", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(405)
			return
		}
		var q Execute
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&q) != nil {
			http.Error(w, "invalid JSON", 400)
			return
		}
		result, e := f.executeMode(q, r.URL.Query().Get("cancel") == "1")
		if e != nil {
			http.Error(w, e.Error(), 409)
			return
		}
		json.NewEncoder(w).Encode(result)
	})
	http.HandleFunc("/ack", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(405)
			return
		}
		var q struct {
			ID string `json:"id"`
		}
		json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&q)
		f.mu.Lock()
		defer f.mu.Unlock()
		delete(f.state.Results, q.ID)
		f.pruneUsed()
		if e := f.save(); e != nil {
			http.Error(w, "save error", 500)
			return
		}
		w.WriteHeader(204)
	})
	log.Fatal(http.ListenAndServe("127.0.0.1:18203", nil))
}
