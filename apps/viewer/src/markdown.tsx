import type { ReactNode } from "react";

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "divider" }
  | { kind: "callout"; tone: CalloutTone; text: string };

export type CalloutTone = "note" | "info" | "tip" | "warning" | "danger";

const CALLOUT: Record<string, CalloutTone> = {
  NOTE: "note",
  INFO: "info",
  TIP: "tip",
  WARNING: "warning",
  DANGER: "danger",
};

function calloutClass(tone: CalloutTone): string {
  if (tone === "warning") {
    return "border-l-[3px] border-[var(--warning)] bg-elevated px-md py-sm";
  }
  if (tone === "danger") {
    return "border-l-[3px] border-removed bg-elevated px-md py-sm";
  }
  if (tone === "tip") {
    return "border-l-[3px] border-[var(--added)] bg-elevated px-md py-sm";
  }
  return "border-l-[3px] border-[var(--info)] bg-elevated px-md py-sm";
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: "divider" });
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2] ?? "",
      });
      i += 1;
      continue;
    }
    const alert = /^>\s*\[!(NOTE|INFO|TIP|WARNING|DANGER)\]\s*(.*)$/i.exec(line);
    if (alert) {
      const tone = CALLOUT[alert[1]!.toUpperCase()] ?? "note";
      const body = [alert[2] ?? ""];
      i += 1;
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "callout", tone, text: body.join("\n").trim() });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [line.replace(/^>\s?/, "")];
      i += 1;
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const body = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^```/.test(lines[i] ?? "") &&
      !/^---+$/.test((lines[i] ?? "").trim()) &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? "")
    ) {
      body.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: body.join(" ") });
  }
  return blocks;
}

export function MarkdownBody({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="flex flex-col gap-md text-body leading-[1.625]">
      {blocks.map((block, index) => (
        <BlockView block={block} key={index} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  if (block.kind === "heading") {
    const className = block.level === 1 ? "text-display-m" : "text-display-s";
    return <p className={className}>{block.text}</p>;
  }
  if (block.kind === "quote") {
    return <blockquote className="border-l-[3px] border-hairline pl-md text-muted-foreground">{block.text}</blockquote>;
  }
  if (block.kind === "code") {
    return (
      <pre className="overflow-auto rounded-md bg-inset p-md text-body-s whitespace-pre-wrap">{block.text}</pre>
    );
  }
  if (block.kind === "list") {
    return (
      <ul className={block.ordered ? "list-decimal pl-lg" : "list-disc pl-lg"}>
        {block.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.kind === "divider") {
    return <hr className="border-hairline" />;
  }
  if (block.kind === "callout") {
    return (
      <div className={calloutClass(block.tone)} data-callout={block.tone}>
        <div className="text-label uppercase tracking-wide text-muted-foreground">{block.tone}</div>
        <div className="whitespace-pre-wrap">{block.text}</div>
      </div>
    );
  }
  return <p className="whitespace-pre-wrap">{block.text}</p>;
}

export function parseMarkdownForTests(source: string): Block[] {
  return parseBlocks(source);
}
