package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type Order struct {
	ID        string `json:"id"`
	Book      string `json:"book"`
	Owner     string `json:"owner"`
	Side      string `json:"side"`
	Price     int64  `json:"price"`
	Remaining int64  `json:"remaining"`
	Sequence  int64  `json:"sequence"`
}
type Command struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Order Order  `json:"order"`
}
type Trade struct {
	ID       string `json:"id"`
	Buy      string `json:"buy"`
	Sell     string `json:"sell"`
	Price    int64  `json:"price"`
	Quantity int64  `json:"quantity"`
}
type Result struct {
	Command   Command `json:"command"`
	Trades    []Trade `json:"trades"`
	Remaining int64   `json:"remaining"`
	Canceled  int64   `json:"canceled"`
	Sequence  int64   `json:"sequence"`
}
type State struct {
	Orders   map[string]Order  `json:"orders"`
	Results  map[string]Result `json:"results"`
	Sequence int64             `json:"sequence"`
}
type Engine struct {
	mu    sync.Mutex
	state State
	path  string
}

func openEngine(path string) (*Engine, error) {
	e := &Engine{path: path, state: State{Orders: map[string]Order{}, Results: map[string]Result{}}}
	b, err := os.ReadFile(path)
	if err == nil {
		err = json.Unmarshal(b, &e.state)
		if err == nil && (e.state.Orders == nil || e.state.Results == nil) {
			err = errors.New("invalid snapshot maps")
		}
	} else if os.IsNotExist(err) {
		err = nil
	}
	return e, err
}
func (e *Engine) apply(c Command) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if r, ok := e.state.Results[c.ID]; ok {
		if r.Command != c {
			return Result{}, errors.New("command ID reused with different payload")
		}
		return r, nil
	}
	if c.ID == "" || c.Order.ID == "" || c.Order.Book == "" {
		return Result{}, errors.New("missing identifiers")
	}
	b, _ := json.Marshal(e.state)
	var s State
	json.Unmarshal(b, &s)
	s.Sequence++
	r := Result{Command: c, Trades: []Trade{}, Sequence: s.Sequence}
	o := c.Order
	if c.Kind == "cancel" {
		old, ok := s.Orders[o.ID]
		if ok {
			if old.Book != o.Book || old.Owner != o.Owner {
				return Result{}, errors.New("ownership mismatch")
			}
			r.Canceled = old.Remaining
			delete(s.Orders, o.ID)
		}
	} else if c.Kind == "place" {
		if o.Price <= 0 || o.Price > 100000000 || o.Remaining <= 0 || o.Remaining > 1000000 || (o.Side != "BUY" && o.Side != "SELL") {
			return Result{}, errors.New("invalid order")
		}
		if _, ok := s.Results[o.ID]; ok {
			return Result{}, errors.New("order exists")
		}
		o.Sequence = s.Sequence
		candidates := []Order{}
		for _, m := range s.Orders {
			if m.Book == o.Book && m.Side != o.Side && ((o.Side == "BUY" && m.Price <= o.Price) || (o.Side == "SELL" && m.Price >= o.Price)) {
				candidates = append(candidates, m)
			}
		}
		sort.Slice(candidates, func(i, j int) bool {
			a, b := candidates[i], candidates[j]
			if a.Price == b.Price {
				return a.Sequence < b.Sequence
			}
			if o.Side == "BUY" {
				return a.Price < b.Price
			}
			return a.Price > b.Price
		})
		for _, m := range candidates {
			if o.Remaining == 0 {
				break
			}
			if m.Owner == o.Owner {
				continue
			}
			q := o.Remaining
			if m.Remaining < q {
				q = m.Remaining
			}
			buy, sell := o.ID, m.ID
			if o.Side == "SELL" {
				buy, sell = m.ID, o.ID
			}
			r.Trades = append(r.Trades, Trade{fmt.Sprintf("%d-%d", s.Sequence, len(r.Trades)), buy, sell, m.Price, q})
			o.Remaining -= q
			m.Remaining -= q
			if m.Remaining == 0 {
				delete(s.Orders, m.ID)
			} else {
				s.Orders[m.ID] = m
			}
		}
		r.Remaining = o.Remaining
		if o.Remaining > 0 {
			s.Orders[o.ID] = o
		}
	} else {
		return Result{}, errors.New("unknown command")
	}
	s.Results[c.ID] = r
	data, err := json.Marshal(s)
	if err != nil {
		return Result{}, err
	}
	if err = os.MkdirAll(filepath.Dir(e.path), 0700); err != nil {
		return Result{}, err
	}
	f, err := os.CreateTemp(filepath.Dir(e.path), ".snapshot-")
	if err != nil {
		return Result{}, err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	f.Close()
	if err != nil {
		return Result{}, err
	}
	if err = os.Rename(tmp, e.path); err != nil {
		return Result{}, err
	}
	dir, err := os.Open(filepath.Dir(e.path))
	if err != nil {
		log.Fatal("ambiguous persistence; restart required: ", err)
	}
	err = dir.Sync()
	dir.Close()
	if err != nil {
		log.Fatal("ambiguous persistence; restart required: ", err)
	}
	e.state = s
	return r, nil
}
func main() {
	path := os.Getenv("STATE_FILE")
	if path == "" {
		path = "data/state.json"
	}
	e, err := openEngine(path)
	if err != nil {
		log.Fatal(err)
	}
	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		e.mu.Lock()
		defer e.mu.Unlock()
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintf(w, "exchange_matching_commands_total %d\nexchange_matching_open_orders %d\n", e.state.Sequence, len(e.state.Orders))
	})
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "UP"})
	})
	http.HandleFunc("/command", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(405)
			return
		}
		var c Command
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&c); err != nil {
			http.Error(w, "invalid JSON", 400)
			return
		}
		result, err := e.apply(c)
		if err != nil {
			http.Error(w, err.Error(), 409)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})
	http.HandleFunc("/book", func(w http.ResponseWriter, r *http.Request) {
		e.mu.Lock()
		defer e.mu.Unlock()
		orders := []Order{}
		for _, o := range e.state.Orders {
			if o.Book == r.URL.Query().Get("id") {
				orders = append(orders, o)
			}
		}
		sort.Slice(orders, func(i, j int) bool { return orders[i].Sequence < orders[j].Sequence })
		json.NewEncoder(w).Encode(orders)
	})
	log.Fatal(http.ListenAndServe("127.0.0.1:18202", nil))
}
