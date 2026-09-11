package main

import (
	"path/filepath"
	"testing"
)

func TestMatchingRecoveryAndDuplicates(t *testing.T) {
	p := filepath.Join(t.TempDir(), "state.json")
	e, _ := openEngine(p)
	place := func(id, owner, side string, price, q int64) Result {
		c := Command{id, "place", Order{ID: id, Book: "one", Owner: owner, Side: side, Price: price, Remaining: q}}
		r, err := e.apply(c)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	place("a", "maker", "SELL", 100, 3)
	place("b", "maker", "SELL", 100, 4)
	r := place("c", "user", "BUY", 110, 5)
	if len(r.Trades) != 2 || r.Trades[0].Sell != "a" || r.Trades[1].Quantity != 2 {
		t.Fatalf("priority/partial %+v", r)
	}
	e2, err := openEngine(p)
	if err != nil {
		t.Fatal(err)
	}
	again, err := e2.apply(r.Command)
	if err != nil || len(again.Trades) != 2 || e2.state.Orders["b"].Remaining != 2 {
		t.Fatal("duplicate/recovery")
	}
	bad := r.Command
	bad.Order.Price++
	if _, err = e2.apply(bad); err == nil {
		t.Fatal("payload conflict accepted")
	}
	cancel, err := e2.apply(Command{"cancel-b", "cancel", Order{ID: "b", Book: "one", Owner: "maker"}})
	if err != nil || cancel.Canceled != 2 {
		t.Fatal("cancel")
	}
}
func TestIsolation(t *testing.T) {
	e, _ := openEngine(filepath.Join(t.TempDir(), "s"))
	e.apply(Command{"a", "place", Order{ID: "a", Book: "a", Owner: "m", Side: "SELL", Price: 1, Remaining: 1}})
	r, err := e.apply(Command{"b", "place", Order{ID: "b", Book: "b", Owner: "u", Side: "BUY", Price: 2, Remaining: 1}})
	if err != nil || len(r.Trades) != 0 {
		t.Fatal("books crossed")
	}
}

func TestFailedPersistenceDoesNotAccept(t *testing.T) {
	e, _ := openEngine(filepath.Join(t.TempDir(), "s"))
	e.path = "/dev/null/cannot-write"
	_, err := e.apply(Command{"bad", "place", Order{ID: "bad", Book: "b", Owner: "a", Side: "BUY", Price: 100, Remaining: 1}})
	if err == nil || e.state.Sequence != 0 || len(e.state.Orders) != 0 {
		t.Fatal("failed persistence changed acknowledged state")
	}
}
