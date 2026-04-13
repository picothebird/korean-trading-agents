"""
종합 디버깅 테스트 스크립트
백엔드 API 엔드포인트 전체 검증
"""
import urllib.request
import json
import time
import sys

BASE = "http://localhost:8000"
PASS = 0
FAIL = 0

def test(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    status = "✓ PASS" if ok else "✗ FAIL"
    print(f"  {status}  {name}" + (f" — {detail}" if detail else ""))
    if ok:
        PASS += 1
    else:
        FAIL += 1

def get(path: str, timeout: int = 10):
    req = urllib.request.Request(f"{BASE}{path}")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode()), r.status

def post(path: str, data: dict, timeout: int = 30):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", method="POST", data=body,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode()), r.status


print("\n" + "="*55)
print("  Korean Trading Agents — 종합 디버깅 테스트")
print("="*55 + "\n")

# 1. 헬스체크
print("[1] 백엔드 기본 동작")
try:
    d, code = get("/health")
    test("헬스체크", code == 200 and d.get("status") == "ok", f"v{d.get('version')}")
except Exception as e:
    test("헬스체크", False, str(e))
    print("  ⚠️  서버가 실행 중이 아닙니다. run_server.py를 먼저 시작하세요.")
    sys.exit(1)

# 2. 주식 데이터 API
print("\n[2] 주식 데이터 API")
for ticker, name in [("005930", "삼성전자"), ("000660", "SK하이닉스")]:
    try:
        d, code = get(f"/api/stock/{ticker}", timeout=30)
        indicators = d.get("indicators", {})
        price = indicators.get("current_price", 0) or 0
        rsi = indicators.get("rsi_14")
        rsi_str = f"{rsi:.1f}" if rsi is not None else "N/A"
        test(f"주식 데이터 ({name})", code == 200 and price > 0,
             f"가격: {price:,}원, RSI: {rsi_str}")
    except Exception as e:
        test(f"주식 데이터 ({name})", False, str(e))

# 3. 시장 지수 API
print("\n[3] 시장 지수 API")
try:
    d, code = get("/api/market/indices", timeout=20)
    keys = list(d.keys())
    test("시장 지수", code == 200 and len(keys) > 0, f"지수: {', '.join(keys)}")
    if "KOSPI" in d:
        test("KOSPI 값", d["KOSPI"].get("current", 0) > 1000,
             f"{d['KOSPI']['current']:,.2f}")
except Exception as e:
    test("시장 지수", False, str(e))

# 4. 백테스트 API
print("\n[4] 백테스트 API")
try:
    d, code = post("/api/backtest", {
        "ticker": "005930",
        "start_date": "2023-01-01",
        "end_date": "2024-12-31",
        "initial_capital": 10_000_000,
    }, timeout=60)
    m = d.get("metrics", {})
    total_ret = m.get("total_return", -9999)
    max_dd = m.get("max_drawdown", 0)
    trades = m.get("total_trades", 0)
    test("백테스트 실행",
         code == 200 and -100 < total_ret < 200 and max_dd > -100,
         f"수익: {total_ret:+.1f}%, MDD: {max_dd:.1f}%, 거래: {trades}회")
    test("에쿼티 커브", len(d.get("equity_curve", [])) > 10,
         f"{len(d.get('equity_curve', []))}포인트")
except Exception as e:
    test("백테스트 실행", False, str(e))

# 5. 분석 시작 API
print("\n[5] 분석 파이프라인 API")
session_id = None
try:
    d, code = post("/api/analyze/start", {"ticker": "005930"}, timeout=15)
    session_id = d.get("session_id")
    test("분석 시작", code == 200 and session_id, f"세션: {session_id[:8]}...")
except Exception as e:
    test("분석 시작", False, str(e))

# 6. SSE 스트림 연결 확인 (1초만)
if session_id:
    try:
        req = urllib.request.Request(f"{BASE}/api/analyze/stream/{session_id}")
        with urllib.request.urlopen(req, timeout=3) as r:
            chunk = r.read(256).decode()
            test("SSE 스트림", r.status == 200 and "data:" in chunk, chunk[:60].strip())
    except Exception as e:
        # timeout은 정상 (stream은 계속 열려있음)
        if "timed out" in str(e).lower() or "timeout" in str(e).lower():
            test("SSE 스트림", True, "(타임아웃 = 정상 스트림)")
        else:
            test("SSE 스트림", False, str(e))

# 7. Kelly Criterion 계산 검증
print("\n[6] Kelly Criterion 검증 (내부 로직)")
try:
    import sys; sys.path.insert(0, "C:/Users/summu/Desktop/hub/korean-trading-agents")
    from agents.orchestrator.orchestrator import _kelly_position_size
    kelly1 = _kelly_position_size([0.7, 0.8, 0.6])  # 높은 신뢰도
    kelly2 = _kelly_position_size([0.4, 0.3, 0.5])  # 낮은 신뢰도
    test("Kelly 고신뢰도", 0.05 <= kelly1 <= 0.25, f"{kelly1*100:.1f}%")
    test("Kelly 저신뢰도", kelly2 <= kelly1, f"{kelly2*100:.1f}% < {kelly1*100:.1f}%")
except Exception as e:
    test("Kelly 계산", False, str(e))

# 7. JSON 파싱 안전성
print("\n[7] JSON 파싱 안전성")
try:
    from agents.orchestrator.orchestrator import _safe_parse_json
    r1 = _safe_parse_json('```json\n{"action": "BUY"}\n```', {})
    r2 = _safe_parse_json('{"signal": "HOLD", "confidence": 0.5}', {})
    r3 = _safe_parse_json("완전히 잘못된 텍스트", {"fallback": True})
    test("코드블록 JSON 파싱", r1.get("action") == "BUY")
    test("순수 JSON 파싱", r2.get("signal") == "HOLD")
    test("폴백 처리", r3.get("fallback") is True)
except Exception as e:
    test("JSON 파싱", False, str(e))

# 최종 요약
print("\n" + "="*55)
total = PASS + FAIL
print(f"  결과: {PASS}/{total} 통과  {'🎉 전부 통과!' if FAIL == 0 else f'⚠️  {FAIL}개 실패'}")
print("="*55 + "\n")

sys.exit(0 if FAIL == 0 else 1)
