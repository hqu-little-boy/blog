import { visit } from "unist-util-visit";

/**
 * Checks whether an inlineMath node was authored with double dollars "$$...$$".
 * In markdown authoring, "$$...$$" signifies display math (block formula),
 * even if authored on a single line or without blank lines around it.
 */
function isDoubleDollar(node: any): boolean {
  if (node.type !== "inlineMath" || typeof node.value !== "string") {
    return false;
  }
  if (!node.position || !node.position.start || !node.position.end) {
    return false;
  }
  const startOffset = node.position.start.offset;
  const endOffset = node.position.end.offset;
  if (typeof startOffset !== "number" || typeof endOffset !== "number") {
    return false;
  }
  const rawLength = endOffset - startOffset;
  // Opening "$$" and closing "$$" take at least 4 characters
  return rawLength >= node.value.length + 4;
}

/**
 * Remark plugin to enhance LaTeX math formulas and CJK markdown formatting:
 * 1. Automatically promotes any "$$...$$" math (even single-line or unspaced)
 *    into a first-class block display math node (displayMode: true), cleanly
 *    splitting the surrounding paragraph so that formulas never squish inline with text.
 * 2. Unwraps accidental nested strong nodes caused by CommonMark CJK delimiter quirks
 *    (e.g. "**前缀（解释）**文**后缀**" where the second "**" fails right-flanking
 *    due to trailing punctuation and is erroneously treated as left-flanking).
 * 3. Fixes unparsed CJK bold syntax (e.g. "**词（解释）**字符" where CommonMark flanking
 *    delimiter rules fail due to punctuation adjacency).
 */
export function remarkMathEnhancer() {
  return function (tree: any) {
    // 1. Fix accidental nested strong tags caused by CJK punctuation emphasis flaws
    visit(tree, "paragraph", (p: any) => {
      if (!p.children) return;
      const newChildren: any[] = [];
      let modified = false;

      for (const child of p.children) {
        if (child.type === "strong" && child.children) {
          const nestedIdx = child.children.findIndex((c: any) => c.type === "strong");
          if (nestedIdx !== -1) {
            modified = true;
            const before = child.children.slice(0, nestedIdx);
            const middle = child.children[nestedIdx].children || [];
            const after = child.children.slice(nestedIdx + 1);

            if (before.length > 0) newChildren.push({ type: "strong", children: before });
            if (middle.length > 0) newChildren.push(...middle);
            if (after.length > 0) newChildren.push({ type: "strong", children: after });
            continue;
          }
        }
        newChildren.push(child);
      }
      if (modified) {
        p.children = newChildren;
      }
    });

    // 2. Fix unparsed CJK bold in text nodes
    visit(tree, (node: any) => {
      if (!node.children) return;
      const newChildren: any[] = [];
      let modified = false;

      for (const child of node.children) {
        if (
          child.type === "text" &&
          typeof child.value === "string" &&
          child.value.includes("**")
        ) {
          const regex = /\*\*([^\*\n]+?)\*\*/g;
          let lastIndex = 0;
          let match: RegExpExecArray | null;
          let matchedAny = false;

          while ((match = regex.exec(child.value)) !== null) {
            matchedAny = true;
            if (match.index > lastIndex) {
              newChildren.push({
                type: "text",
                value: child.value.slice(lastIndex, match.index),
              });
            }
            newChildren.push({
              type: "strong",
              children: [{ type: "text", value: match[1] }],
            });
            lastIndex = regex.lastIndex;
          }

          if (matchedAny) {
            modified = true;
            if (lastIndex < child.value.length) {
              newChildren.push({
                type: "text",
                value: child.value.slice(lastIndex),
              });
            }
          } else {
            newChildren.push(child);
          }
        } else {
          newChildren.push(child);
        }
      }

      if (modified) {
        node.children = newChildren;
      }
    });

    // 3. Promote $$ inlineMath (or math inside paragraphs) to block math and split paragraphs
    visit(tree, (parent: any) => {
      if (!parent.children) return;

      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child.type === "paragraph" && child.children) {
          const hasDisplayMath = child.children.some(
            (c: any) => isDoubleDollar(c) || c.type === "math"
          );
          if (!hasDisplayMath) continue;

          const newChildren: any[] = [];
          let currentInline: any[] = [];

          const flushCurrentInline = () => {
            if (currentInline.length === 0) return;

            // Trim whitespace-only text nodes at paragraph boundaries
            while (
              currentInline.length > 0 &&
              currentInline[0].type === "text" &&
              !currentInline[0].value?.trim()
            ) {
              currentInline.shift();
            }
            while (
              currentInline.length > 0 &&
              currentInline[currentInline.length - 1].type === "text" &&
              !currentInline[currentInline.length - 1].value?.trim()
            ) {
              currentInline.pop();
            }

            if (currentInline.length > 0) {
              // Strip boundary newlines
              const first = currentInline[0];
              if (first.type === "text" && first.value) {
                first.value = first.value.replace(/^[\n\r]+/, "");
              }
              const last = currentInline[currentInline.length - 1];
              if (last.type === "text" && last.value) {
                last.value = last.value.replace(/[\n\r]+$/, "");
              }

              if (
                currentInline.some(
                  (x: any) =>
                    x.type !== "text" || (x.value && x.value.trim().length > 0)
                )
              ) {
                newChildren.push({
                  type: "paragraph",
                  children: currentInline,
                });
              }
            }
            currentInline = [];
          };

          for (const item of child.children) {
            const isDisplay = isDoubleDollar(item) || item.type === "math";

            if (isDisplay) {
              flushCurrentInline();
              newChildren.push({
                type: "math",
                meta: null,
                value: item.value,
                data: {
                  hName: "div",
                  hProperties: {
                    className: ["math", "math-display"],
                  },
                  hChildren: [{ type: "text", value: item.value }],
                },
              });
            } else {
              currentInline.push(item);
            }
          }

          flushCurrentInline();

          if (newChildren.length > 0) {
            parent.children.splice(i, 1, ...newChildren);
            i += newChildren.length - 1;
          }
        }
      }
    });
  };
}
