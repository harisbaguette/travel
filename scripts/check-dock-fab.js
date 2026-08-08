// + 단추(.dock-fab)는 항상 하단 메뉴(.dock-glass) 뒤에 있어야 한다는 규칙이
// 자꾸 다시 깨져서(z-index를 앞으로 빼는 수정이 반복됨), 빌드 때마다 자동으로
// 확인한다. 어긴 규칙을 발견하면 빌드를 멈추고 이유를 알려준다.
const fs = require("fs");
const path = require("path");

const CSS_PATH =
  process.argv[2] || path.join(__dirname, "..", "src", "app", "globals.css");

// 중첩 규칙(@media 안의 규칙 포함)까지 안전하게 나누는 아주 단순한 CSS 조각내기.
// 진짜 CSS 파서는 아니지만, 이 파일이 쓰는 문법(주석·@media·평범한 선택자)에는 충분하다.
function parseRules(css) {
  const rules = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    const braceIdx = css.indexOf("{", i);
    if (braceIdx === -1) break;
    const selector = css.slice(i, braceIdx).trim();
    let depth = 1;
    let j = braceIdx + 1;
    while (j < n && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(braceIdx + 1, j - 1);
    if (selector.startsWith("@")) {
      rules.push(...parseRules(body));
    } else if (selector) {
      rules.push({ selector, body });
    }
    i = j;
  }
  return rules;
}

const raw = fs.readFileSync(CSS_PATH, "utf8");
const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = parseRules(withoutComments);

// ".dock-fab" 은 잡되 ".dock-fab--hidden" 같은 다른 이름은 안 잡는 경계.
const targetsFab = (selector) =>
  selector
    .split(",")
    .some((part) => /\.dock-fab(?![-\w])/.test(part.trim()));

const fabRules = rules.filter((r) => targetsFab(r.selector));
const violations = [];
let sawBaseRule = false;

for (const rule of fabRules) {
  const zMatches = [...rule.body.matchAll(/z-index\s*:\s*([^;]+);/g)];
  if (zMatches.length === 0) continue;
  const value = zMatches[zMatches.length - 1][1].trim();

  if (rule.selector === ".dock-fab") sawBaseRule = true;

  if (value !== "1") {
    violations.push(`  - "${rule.selector}" 에서 z-index: ${value} (1이어야 함)`);
  }
}

if (!sawBaseRule) {
  console.error(
    "[check-dock-fab] globals.css에서 .dock-fab 기본 규칙 자체를 못 찾음 — 이름이 바뀌었는지 확인 필요"
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    "[check-dock-fab] + 단추는 항상 하단 메뉴 뒤(z-index:1)에 있어야 하는데, 앞으로 빼는 규칙이 있음:\n" +
      violations.join("\n") +
      "\n앞으로 빼지 말고, 비침 문제는 .dock-glass::before 흰 뚜껑 쪽에서 해결할 것."
  );
  process.exit(1);
}

console.log("[check-dock-fab] OK — + 단추는 여전히 메뉴 뒤에 있음");
