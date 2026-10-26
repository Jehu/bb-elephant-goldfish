// Markdown files imported with `{ type: "text" }` are bundled as strings by `bb plugin build`.
declare module "*.md" {
  const text: string;
  export default text;
}
