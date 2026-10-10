import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ChatMarkdown({ texto }: { texto: string }) {
  return (
    <div
      className="min-w-0 space-y-3 [overflow-wrap:anywhere]
        [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm
        [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold
        [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold
        [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5
        [&_li]:my-1 [&_li>p]:my-1 [&_li>ul]:mt-1 [&_li>ol]:mt-1
        [&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0
        [&_input[type=checkbox]]:mr-2
        [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40
        [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote>p]:my-1
        [&_strong]:font-semibold [&_hr]:border-border
        [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs
        [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg
        [&_pre]:bg-background/60 [&_pre]:p-3 [&_pre]:whitespace-pre
        [&_pre>code]:bg-transparent [&_pre>code]:p-0
        [&_th]:border [&_th]:border-border [&_th]:bg-background/60 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold
        [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2"
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children, title }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto rounded-lg">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          // Respostas são texto: imagens externas aparecem pela descrição.
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {texto}
      </Markdown>
    </div>
  );
}
