import { Crepe } from "@milkdown/crepe";
import { useEffect, useRef } from "react";
import "@milkdown/crepe/theme/common/style.css";

const INVITE = "Write a first sentence.";

export function LiveMarkdown({
  value,
  onChange,
  autofocus,
}: {
  value: string;
  onChange: (markdown: string) => void;
  autofocus: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = root.current;
    if (!host) {
      return;
    }
    const crepe = new Crepe({
      root: host,
      defaultValue: value,
      features: {
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.Table]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: INVITE, mode: "doc" },
      },
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });
    void crepe.create().then(() => {
      if (autofocus) {
        host.querySelector<HTMLElement>(".ProseMirror")?.focus();
      }
    });
    return () => {
      void crepe.destroy();
    };
  }, []);

  return <div ref={root} className="journal-editor" data-editor="live-markdown" />;
}
