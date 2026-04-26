// ─────────────────────────────────────────────
// 한글 본문 자동 줄바꿈 유틸
// - 한 문장이 길게 이어질 때 "~다. " "~요. " "~죠. " 등의 종결 어미 또는
//   문장부호(. ! ?) 뒤에 줄바꿈을 삽입한다.
// - 짧은 텍스트(임계값 미만)는 그대로 둔다 → 1~2줄 안내는 쓸데없이 분할되지 않음.
// - `· · ·` 류의 인라인 구분자 뒤에도 줄바꿈을 끼워 넣어 읽기 쉽게 한다.
// - 숫자 사이 소수점(0.18, 1.5) 등을 깨지 않도록 다음 글자가 한글/영문/괄호일 때만 자른다.
// ─────────────────────────────────────────────

const SENTENCE_END_RE = /([.!?])\s+(?=[가-힣A-Za-z(])/g;
const KOREAN_SENTENCE_RE = /([가-힣]+(?:다|요|죠|네|군요|습니다|입니다|에요|예요|봐요|세요))(\.|\s)\s*(?=[가-힣A-Za-z])/g;
const SEPARATOR_RE = /\s+·\s+/g;

/**
 * 긴 본문에 자동 줄바꿈을 삽입한다.
 * @param s 입력 문자열
 * @param minLength 이 길이 미만이면 변형하지 않음 (기본 60자)
 */
export function breakLongText(s: string, minLength = 60): string {
  if (!s || s.length < minLength) return s;
  return s
    .replace(SENTENCE_END_RE, "$1\n")
    .replace(KOREAN_SENTENCE_RE, (_m, stem, punct) => `${stem}${punct === "." ? "." : ""}\n`)
    .replace(SEPARATOR_RE, "\n· ");
}

/** React 인라인 스타일에 함께 쓰는 헬퍼 — pre-line이면 \n이 줄바꿈으로 렌더링됨 */
export const PRE_LINE_STYLE = {
  whiteSpace: "pre-line" as const,
  wordBreak: "keep-all" as const,
  overflowWrap: "anywhere" as const,
};
