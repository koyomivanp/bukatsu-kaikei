import { useState } from "react";

/** クリップボードにコピーする。使えないブラウザでは選択してコピーする */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** 文章をコピーするボタン。コピーできなかったときは、下の文章を選んでもらう */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState<"" | "ok" | "ng">("");
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          setCopied((await copyText(text)) ? "ok" : "ng");
          setTimeout(() => setCopied(""), 2500);
        }}
      >
        {copied === "ok" ? "コピーしました" : "文章をコピー"}
      </button>
      {copied === "ng" && <span className="caution">コピーできませんでした。下の文章を選んでコピーしてください。</span>}
    </>
  );
}
