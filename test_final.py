import urllib.request, json

# 헬스체크
with urllib.request.urlopen('http://localhost:8000/health', timeout=5) as r:
    print('Backend:', json.loads(r.read()))

# 프론트엔드
with urllib.request.urlopen('http://localhost:3000', timeout=5) as r:
    content = r.read().decode()
    print('Frontend: HTTP', r.status, '- Korean Trading in HTML:', 'Korean Trading' in content)

# 시장 지수
with urllib.request.urlopen('http://localhost:8000/api/market/indices', timeout=10) as r:
    d = json.loads(r.read())
    for name, v in d.items():
        print(name, ':', v['current'], '|', round(v['change_pct'], 2), '%')

print('\n=== All systems OK ===')
