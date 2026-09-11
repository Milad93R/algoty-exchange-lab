package main

import (
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func fixture(path string) *Feed {
	f := newFeed(path)
	m := f.markets["BTCUSDT"]
	m.Connected = true
	m.Updated = time.Now().UnixMilli()
	m.Sequence = 42
	m.Asks = []Level{{10100, 5}, {10200, 10}}
	m.Bids = []Level{{10000, 9}}
	return f
}
func order(id string) Execute {
	return Execute{ID: id, Account: "account-a", Symbol: "BTCUSDT", Side: "BUY", Price: 10200, Quantity: 20}
}
func qty(r Receipt) int64 {
	var q int64
	for _, v := range r.Fills {
		q += v.Quantity
	}
	return q
}
func TestDepthCapacityDurability(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	f := fixture(path)
	q := order("command-1")
	r, e := f.execute(q)
	if e != nil || qty(r) != 15 || len(r.Fills) != 2 {
		t.Fatal(r, e)
	}
	r2, e := f.execute(q)
	if e != nil || qty(r2) != 15 {
		t.Fatal("retry", r2, e)
	}
	q2 := order("command-2")
	r2, e = f.execute(q2)
	if e != nil || qty(r2) != 0 {
		t.Fatal("reused liquidity", r2, e)
	}
	f2 := fixture(path)
	r2, e = f2.execute(q)
	if e != nil || qty(r2) != 15 {
		t.Fatal("lost receipt", r2, e)
	}
	q.Quantity = 1
	if _, e = f2.execute(q); e == nil {
		t.Fatal("conflict accepted")
	}
	f2.pruneUsed()
	if len(f2.state.Used) != 2 {
		t.Fatal("current capacity discarded")
	}
	f2.markets[q.Symbol].Sequence++
	f2.pruneUsed()
	if len(f2.state.Used) != 0 {
		t.Fatal("old snapshot not pruned")
	}
}
func TestRestingStrictTradeThrough(t *testing.T) {
	f := fixture("")
	now := time.Now().UnixMilli()
	m := f.markets["BTCUSDT"]
	m.Trades = []Tick{{1, now - 5, 10000, 10, true}, {2, now, 10200, 10, true}, {3, now, 10100, 7, false}, {4, now, 10100, 3, true}}
	q := order("resting-1")
	q.Resting = true
	q.After = now - 1
	r, e := f.execute(q)
	if e != nil || qty(r) != 3 || r.Fills[0].Price != q.Price {
		t.Fatal(r, e)
	}
	q.ID = "resting-2"
	r, e = f.execute(q)
	if e != nil || qty(r) != 0 {
		t.Fatal("double consumed trade", r, e)
	}
	q.ID = "resting-3"
	q.Account = "account-b"
	r, e = f.execute(q)
	if e != nil || qty(r) != 3 {
		t.Fatal("comparison isolation", r, e)
	}
}
func TestStaleCancelAndPersistenceFailure(t *testing.T) {
	f := fixture("")
	q := order("cancel-1")
	f.markets[q.Symbol].Updated -= 5000
	if _, e := f.execute(q); e == nil {
		t.Fatal("stale fill")
	}
	r, e := f.executeMode(q, true)
	if e != nil || qty(r) != 0 {
		t.Fatal("cancel resolution", e)
	}
	f.markets[q.Symbol].Updated = time.Now().UnixMilli()
	r, e = f.execute(q)
	if e != nil || qty(r) != 0 {
		t.Fatal("canceled command resurrected")
	}
	f.path = "/dev/null/impossible"
	q.ID = "failure-1"
	if _, e = f.execute(q); e == nil {
		t.Fatal("save failure ignored")
	}
	f.path = ""
	r, e = f.execute(q)
	if e != nil || qty(r) != 15 {
		t.Fatal("failed save consumed liquidity", r, e)
	}
}
func TestConcurrentLiquidity(t *testing.T) {
	f := fixture("")
	var wg sync.WaitGroup
	var mu sync.Mutex
	var total int64
	for _, id := range []string{"concurrent-1", "concurrent-2", "concurrent-3"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			r, e := f.execute(order(id))
			if e != nil {
				t.Error(e)
			}
			mu.Lock()
			total += qty(r)
			mu.Unlock()
		}(id)
	}
	wg.Wait()
	if total != 15 {
		t.Fatal(total)
	}
}
func TestBinanceCaseSensitiveCandleFields(t *testing.T) {
	raw := []byte(`{"k":{"t":60000,"T":119999,"o":"100","c":"101","h":"102","l":"99","L":123456,"v":"12.5","V":"3","x":true}}`)
	c, e := decodeCandle(raw)
	if e != nil || c.Time != 60000 || c.Low != 99 || c.Volume != 12.5 || !c.Closed {
		t.Fatal(c, e)
	}
}
