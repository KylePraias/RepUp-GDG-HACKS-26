import { useMemo } from "react";
import EditorPrimitive from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/themes/prism-tomorrow.css";

const langMap = {
  javascript: Prism.languages.javascript,
  typescript: Prism.languages.typescript,
  python: Prism.languages.python,
  go: Prism.languages.go,
  rust: Prism.languages.rust,
};

export default function CodeEditor({ value, onChange, language = "javascript", readOnly = false }) {
  const grammar = useMemo(
    () => langMap[language] || Prism.languages.javascript,
    [language],
  );

  return (
    <div
      className={`scroll-area h-full w-full overflow-auto bg-[#0b0b0d] ${readOnly ? "opacity-90" : ""}`}
      data-testid="code-editor-wrapper"
    >
      <EditorPrimitive
        value={value}
        onValueChange={readOnly ? () => {} : onChange}
        highlight={(code) => Prism.highlight(code, grammar, language)}
        padding={14}
        textareaId="repup-code-editor"
        textareaClassName="focus:outline-none"
        readOnly={readOnly}
        className="font-mono text-[13px] leading-[1.55] text-white"
        style={{
          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          minHeight: "100%",
          caretColor: readOnly ? "transparent" : "#CCFF00",
        }}
      />
    </div>
  );
}
