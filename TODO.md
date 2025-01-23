Let's create a VSCode extension called "Color Library".

It has the following features:

- Save a color: Take the current cursor location and try to save the color
- Insert a color: Take the current cursor location insert a color in the appropriate format
- Preview colors and convert them to different formats
- Create a collection of colors
- Insert color collections

Requirements:

- Get the project's information, like what languages are present
- Categorize a cursor's position: Are we in the middle of a color/string? Maybe use tree-sitter
- Determine a set of languages to support: JavaScript, TypeScript, HTML, CSS, Rust
