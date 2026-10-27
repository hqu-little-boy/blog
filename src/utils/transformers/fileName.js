/**
 * Custom Shiki transformer that adds file name or language labels to code blocks.
 *
 * This transformer looks for the `file="filename"` meta attribute in code blocks
 * and creates a styled label showing the filename. If no filename is provided,
 * it displays the programming language tag as a clean M3 pill badge.
 *
 * @param {Object} options - Configuration options for the transformer
 * @param {string} [options.style="v2"] - The styling variant to use
 * @param {boolean} [options.hideDot=false] - Whether to hide the green dot indicator
 */
export const transformerFileName = ({
  style = "v2",
  hideDot = false,
} = {}) => ({
  pre(node) {
    const fileNameOffset = style === "v1" ? "0.75rem" : "-0.75rem";
    node.properties.style =
      (node.properties.style || "") + `--file-name-offset: ${fileNameOffset};`;

    const raw = this.options.meta?.__raw?.split(" ");
    let file = null;

    if (raw) {
      const metaMap = new Map();
      for (const item of raw) {
        const [key, value] = item.split("=");
        if (!key || !value) continue;
        metaMap.set(key, value.replace(/["'`]/g, ""));
      }
      file = metaMap.get("file");
    }

    const lang = this.options.lang;
    const isSpecialLang =
      lang &&
      lang !== "text" &&
      lang !== "plain" &&
      lang !== "txt" &&
      lang !== "plaintext";

    if (file) {
      this.addClassToHast(
        node,
        `mt-8 ${style === "v1" ? "rounded-tl-none" : ""}`
      );

      node.children.push({
        type: "element",
        tagName: "span",
        properties: {
          class: [
            "absolute py-1 text-foreground text-xs font-medium leading-4 select-none pointer-events-none",
            hideDot
              ? "px-2.5"
              : "pl-4 pr-2.5 before:inline-block before:size-1.5 before:bg-green-500 before:rounded-full before:absolute before:top-[45%] before:left-2",
            style === "v1"
              ? "left-0 -top-6 rounded-t-lg border border-b-0 bg-muted/50"
              : "left-3 top-(--file-name-offset) border border-border/80 rounded-full bg-surface/90 dark:bg-surface px-3 shadow-xs",
          ],
        },
        children: [{ type: "text", value: file }],
      });
    } else if (isSpecialLang) {
      node.children.push({
        type: "element",
        tagName: "span",
        properties: {
          class: [
            "absolute left-3 -top-3 rounded-full border border-border/80 bg-surface/90 dark:bg-surface px-2.5 py-0.5 text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground shadow-xs select-none pointer-events-none",
          ],
        },
        children: [{ type: "text", value: lang }],
      });
    }
  },
});
