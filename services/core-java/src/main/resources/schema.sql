CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS balances(session_id text, owner text, base bigint NOT NULL, quote bigint NOT NULL, reserved_base bigint NOT NULL DEFAULT 0, reserved_quote bigint NOT NULL DEFAULT 0, PRIMARY KEY(session_id,owner), CHECK(base>=reserved_base AND quote>=reserved_quote AND reserved_base>=0 AND reserved_quote>=0));
CREATE TABLE IF NOT EXISTS orders(id text PRIMARY KEY, session_id text NOT NULL, owner text NOT NULL, side text NOT NULL, price bigint NOT NULL, quantity bigint NOT NULL, remaining bigint NOT NULL, status text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS outbox(id text PRIMARY KEY, payload text NOT NULL, done boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS trades(id text PRIMARY KEY, session_id text, buy_id text, sell_id text, price bigint, quantity bigint, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS ledger(id bigserial PRIMARY KEY, event_id text NOT NULL, session_id text NOT NULL, owner text NOT NULL, asset text NOT NULL, amount bigint NOT NULL, created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS ledger_session ON ledger(session_id);

CREATE TABLE IF NOT EXISTS v2_users(id text PRIMARY KEY,email text UNIQUE,name text NOT NULL,hash text,salt text,recovery_hash text,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_sessions(token text PRIMARY KEY,user_id text NOT NULL REFERENCES v2_users(id),expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS v2_accounts(id text PRIMARY KEY,user_id text NOT NULL REFERENCES v2_users(id),label text NOT NULL,initial_quote bigint NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_balances(account_id text NOT NULL REFERENCES v2_accounts(id),asset text NOT NULL,total bigint NOT NULL DEFAULT 0,reserved bigint NOT NULL DEFAULT 0,PRIMARY KEY(account_id,asset),CHECK(total>=reserved AND reserved>=0));
CREATE TABLE IF NOT EXISTS v2_orders(id text PRIMARY KEY,account_id text NOT NULL REFERENCES v2_accounts(id),symbol text NOT NULL,side text NOT NULL,kind text NOT NULL,price bigint NOT NULL,quantity bigint NOT NULL,remaining bigint NOT NULL,status text NOT NULL,resting boolean DEFAULT false,after_ms bigint NOT NULL,attempt bigint NOT NULL DEFAULT 0,receipt_key text,request_key text NOT NULL,created_at timestamptz DEFAULT now(),UNIQUE(account_id,request_key));
CREATE TABLE IF NOT EXISTS v2_fills(id text PRIMARY KEY,order_id text NOT NULL REFERENCES v2_orders(id),account_id text NOT NULL,symbol text NOT NULL,side text NOT NULL,price bigint NOT NULL,quantity bigint NOT NULL,fee bigint NOT NULL,evidence text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_ledger(id bigserial PRIMARY KEY,event_id text NOT NULL,account_id text NOT NULL,owner text NOT NULL,asset text NOT NULL,amount bigint NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_missions(id text PRIMARY KEY,user_id text NOT NULL,account_id text NOT NULL,brief text NOT NULL,plan text NOT NULL,status text NOT NULL DEFAULT 'DRAFT',version integer NOT NULL DEFAULT 1,parent_id text,group_id text,last_bar bigint DEFAULT 0,created_at timestamptz DEFAULT now(),started_at timestamptz,expires_at timestamptz);
CREATE TABLE IF NOT EXISTS v2_events(id bigserial PRIMARY KEY,mission_id text NOT NULL,kind text NOT NULL,message text NOT NULL,evidence text NOT NULL DEFAULT '{}',created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_equity(id bigserial PRIMARY KEY,mission_id text NOT NULL,equity bigint NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_shares(token text PRIMARY KEY,user_id text NOT NULL,group_id text NOT NULL,created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS v2_orders_active ON v2_orders(status);
CREATE INDEX IF NOT EXISTS v2_ledger_account ON v2_ledger(account_id);
CREATE INDEX IF NOT EXISTS v2_events_mission ON v2_events(mission_id,id);
CREATE INDEX IF NOT EXISTS v2_equity_mission ON v2_equity(mission_id,id);

ALTER TABLE v2_missions ADD COLUMN IF NOT EXISTS flow_state TEXT NOT NULL DEFAULT '{}';
