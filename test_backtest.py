import urllib.request, json

body = json.dumps({
    'ticker': '005930',
    'start_date': '2023-01-01',
    'end_date': '2024-12-31',
    'initial_capital': 10000000
}).encode()
req = urllib.request.Request(
    'http://localhost:8000/api/backtest',
    method='POST',
    data=body,
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req, timeout=30) as r:
    d = json.loads(r.read().decode())
    m = d['metrics']
    print(f"총 수익률: {m['total_return']*100:.1f}%")
    print(f"샤프비율: {m['sharpe_ratio']:.2f}")
    print(f"최대낙폭: {m['max_drawdown']*100:.1f}%")
    print(f"알파: {m['alpha']*100:.1f}%")
    print(f"거래횟수: {m['total_trades']}")
    print(f"기간: {d['period']}")
