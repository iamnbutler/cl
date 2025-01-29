// coming at this with no prior vsc extension knowledge – looking back I wish I
// had done some reading of the docs before starting, rather than just jumping
// in with an llm and my bare hands...
//
// there is probably some much better ways to tackle some of these things, but
// hey, that is always the case :D

import * as vscode from "vscode";
import chroma from "chroma-js";

const explicitlySupportedLanguages = [
  "rust",
  "typescript",
  "css",
  "json",
] as const;

type SupportedLanguage = (typeof explicitlySupportedLanguages)[number];

// add some temporary default colors to show off how things work

// Add a default set of colors
const primaryColor: { [key: string]: string } = {
  Red: "#FF0000",
  Green: "#00FF00",
  Blue: "#0000FF",
  Cyan: "#00FFFF",
  Magenta: "#FF00FF",
  Yellow: "#FFFF00",
  Black: "#000000",
  White: "#FFFFFF",
};

// Gruvbox color scheme
const gruvboxColors: { [key: string]: string } = {
  Dark0Hard: "#1D2021",
  Dark0: "#282828",
  Dark0Soft: "#32302F",
  Dark1: "#3C3836",
  Dark2: "#504945",
  Dark3: "#665C54",
  Dark4: "#7C6F64",
  Gray: "#928374",
  Light0Hard: "#F9F5D7",
  Light0: "#FBF1C7",
  Light0Soft: "#F2E5BC",
  Light1: "#EBDBB2",
  Light2: "#D5C4A1",
  Light3: "#BDAE93",
  Light4: "#A89984",
  BrightRed: "#FB4934",
  BrightGreen: "#B8BB26",
  BrightYellow: "#FABD2F",
  BrightBlue: "#83A598",
  BrightPurple: "#D3869B",
  BrightAqua: "#8EC07C",
  BrightOrange: "#FE8019",
  NeutralRed: "#CC241D",
  NeutralGreen: "#98971A",
  NeutralYellow: "#D79921",
  NeutralBlue: "#458588",
  NeutralPurple: "#B16286",
  NeutralAqua: "#689D6A",
  NeutralOrange: "#D65D0E",
};

// obviously there is a lot more color types we could support here. I've been
// out of the typescript game for a bit, not sure if there is something as nice
// as the `palette` crate in rust, but we could probably use that for color
// parsing instead of a regex-based approach.

const hexColorRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/;
const rgbColorRegex = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/;
const rgbaColorRegex =
  /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?\.?\d*)\s*\)/;

function getInitialColorLibrary(): {
  [folder: string]: { [key: string]: string };
} {
  return {
    Primary: { ...primaryColor },
    Gruvbox: { ...gruvboxColors },
  };
}

// i didn't have enough time to really research if there is a better way to do this, but it seems like to render something here in the tree view you need to impl a custom svg icon

function createColorIcon(color: string): vscode.Uri {
  const svg = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <rect width="14" height="14" x="1" y="1" fill="${color}" stroke="white" stroke-width="1" stroke-opacity="0.1" rx="2" ry="2" />
</svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return vscode.Uri.parse(`data:image/svg+xml;base64,${base64}`);
}

// missing rust's match here :(
function tryParseColor(line: string) {
  const hexMatch = line.match(hexColorRegex);
  const rgbMatch = line.match(rgbColorRegex);
  const rgbaMatch = line.match(rgbaColorRegex);

  let matchedColor: string | null = null;

  if (hexMatch) {
    matchedColor = hexMatch[0];
  } else if (rgbMatch) {
    matchedColor = `rgb(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]})`;
  } else if (rgbaMatch) {
    matchedColor = `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${rgbaMatch[4]})`;
  }

  if (matchedColor) {
    try {
      const color = chroma(matchedColor);
      return color.hex();
    } catch (error) {
      return "Color is invalid, or an unsupported color type";
    }
  }

  try {
    const color = chroma(line.trim());
    return color.hex();
  } catch (error) {
    return "Color is invalid, or an unsupported color type";
  }
}

/**
 * Get the active buffer's language
 * so we can dynamically generate color strings based on the language
 */
function activeBufferLanguage() {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId || null;
}

function languageIsSupported(lang: string): lang is SupportedLanguage {
  return explicitlySupportedLanguages.includes(lang as SupportedLanguage);
}

// ideally with more time i'd use tree-sitter or something here so in languages
// that need it we could add the correct imports. Like in rust, it would be nice
// if we could insert `use palette::rgb::Rgb;` at the top (without creating
// duplicate imports)
function colorStringForLanguage(color: string, lang?: SupportedLanguage) {
  switch (lang) {
    case "rust":
      return `Rgb::new(${color})`;
    case "typescript":
      return color;
    case "css":
      return `#${color}`;
    case "json":
      return `"${color}"`;
    default:
      return color;
  }
}

// as there would probably be a lot of these, it would be nice to use
// something similar to handlebars templates to define color strings
// for various languages/formats, and keep them somewhere external
// like src/templates
function allColorsStringForLanguage(
  colors: { [folder: string]: { [key: string]: string } },
  lang: SupportedLanguage | "default",
): string {
  switch (lang) {
    case "rust":
      let rustCode = `
use palette::rgb::Rgb;

trait Color {
    fn name(&self) -> &'static str;
    fn rgb(&self) -> Rgb;
    fn hex(&self) -> &'static str;
}

`;

      for (const [folder, folderColors] of Object.entries(colors)) {
        const entries = Object.entries(folderColors);
        rustCode += `
#[derive(Debug, Clone, Copy)]
pub enum ${folder}Colors {
    ${entries.map(([name, _]) => name).join(",\n    ")}
}

impl Color for ${folder}Colors {
fn rgb(&self) -> Rgb {
    match self {
        ${entries
          .map(([name, color]) => {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `Self::${name} => Rgb::new(${r}.0, ${g}.0, ${b}.0),`;
          })
          .join("\n            ")}
    }
}

    fn name(&self) -> &'static str {
        match self {
            ${entries.map(([name, _]) => `Self::${name} => "${name}",`).join("\n            ")}
        }
    }

    fn hex(&self) -> &'static str {
        match self {
            ${entries.map(([name, color]) => `Self::${name} => "${color}",`).join("\n            ")}
        }
    }
}`;
      }

      return rustCode;

    case "typescript":
      let tsCode = `
  interface Color {
    name: string;
    hex: string;
    rgb: [number, number, number];
  }

  `;
      for (const [folder, folderColors] of Object.entries(colors)) {
        const entries = Object.entries(folderColors);
        tsCode += `
  export const ${folder}Colors = {
  ${entries
    .map(([name, color]) => {
      const rgb = chroma(color).rgb();
      return `  ${name}: { name: "${name}", hex: "${color}", rgb: [${rgb[0]}, ${rgb[1]}, ${rgb[2]}] }`;
    })
    .join(",\n")}
  } as const;

  export type ${folder}Color = keyof typeof ${folder}Colors;

  `;
      }
      return tsCode;

    case "css":
      let cssCode = `:root {\n`;
      for (const [folder, folderColors] of Object.entries(colors)) {
        const entries = Object.entries(folderColors);
        cssCode += `  /* ${folder} Colors */\n`;
        cssCode += entries
          .map(([name, color]) => {
            const rgb = chroma(color).rgb();
            return `  --${folder}-${name}: ${color};\n  --${folder}-${name}-rgb: ${rgb[0]}, ${rgb[1]}, ${rgb[2]};`;
          })
          .join("\n");
        cssCode += "\n\n";
      }
      cssCode += `}

  /* Color Usage Examples */
  `;
      for (const [folder, folderColors] of Object.entries(colors)) {
        const entries = Object.entries(folderColors);
        cssCode += `/* ${folder} Colors */\n`;
        cssCode += entries
          .map(
            ([name, _]) =>
              `.${folder}-${name} { color: var(--${folder}-${name}); }`,
          )
          .join("\n");
        cssCode += "\n\n";
      }
      return cssCode.trim();

    case "json":
      let jsonCode = "{\n";
      for (const [folder, folderColors] of Object.entries(colors)) {
        const entries = Object.entries(folderColors);
        jsonCode += `  "${folder}": {\n`;
        jsonCode += entries
          .map(([name, color]) => `    "${name}": "${color}"`)
          .join(",\n");
        jsonCode += "\n  },\n";
      }
      jsonCode += "}";
      return jsonCode;

    default:
      let defaultCode = "";
      for (const [folder, folderColors] of Object.entries(colors)) {
        const entries = Object.entries(folderColors);
        defaultCode += `${folder} Colors:\n`;
        defaultCode += entries
          .map(([name, color]) => {
            const rgb = chroma(color).rgb();
            return `  ${name}:\n    Hex: ${color}\n    RGB: ${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
          })
          .join("\n");
        defaultCode += "\n\n";
      }
      return defaultCode.trim();
  }
}

class ColorItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly color: string,
    public readonly folder: string = "Default",
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "colorItem";
    this.description = color;
    this.iconPath = createColorIcon(color);
    this.tooltip = `${label}: ${color}`;
  }
}

// i'm sure with more time I'd find a lot of what I implemented manually for the
// panel (add/remove, etc) is probably natively supported by the
// TreeDataProvider.
//
// it seems like a pretty nicely built api for building
// something quickly that doesn't need too much customization.
class ColorTreeDataProvider
  implements vscode.TreeDataProvider<ColorItem | FolderItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ColorItem | FolderItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  constructor(private context: vscode.ExtensionContext) {}
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element: ColorItem | FolderItem): vscode.TreeItem {
    return element;
  }
  tryGetTreeItem(input: string): ColorItem | null {
    const library = this.context.globalState.get<{
      [folder: string]: { [key: string]: string };
    }>("colorLibrary", {});
    for (const [folder, colors] of Object.entries(library)) {
      const color = colors[input];
      if (color) {
        return new ColorItem(input, color, folder);
      }
    }
    return null;
  }
  getChildren(element?: FolderItem): Thenable<(ColorItem | FolderItem)[]> {
    const library = this.context.globalState.get<{
      [folder: string]: { [key: string]: string };
    }>("colorLibrary", {});
    if (!element) {
      // Root level, return folders
      return Promise.resolve(
        Object.keys(library).map((folder) => new FolderItem(folder)),
      );
    } else {
      // Inside a folder, return colors
      const folderColors = library[element.label] || {};
      return Promise.resolve(
        Object.entries(folderColors).map(
          ([label, color]) => new ColorItem(label, color, element.label),
        ),
      );
    }
  }
}

class FolderItem extends vscode.TreeItem {
  constructor(public readonly label: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "folder";
  }
}

/**
 * Insert all colors from the library into the active editor
 * in a format specific to the current buffer's language when possible
 */
async function insertAllColors(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor");
    return;
  }

  const library = context.globalState.get<{
    [folder: string]: { [key: string]: string };
  }>("colorLibrary", {});
  if (Object.keys(library).length === 0) {
    vscode.window.showInformationMessage("Color library is empty");
    return;
  }

  const lang = activeBufferLanguage();
  let colorString: string;

  if (lang && languageIsSupported(lang)) {
    colorString = allColorsStringForLanguage(library, lang);
  } else {
    colorString = allColorsStringForLanguage(library, "default");
  }

  editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, colorString);
  });

  vscode.window.showInformationMessage("All colors inserted");
}

export function activate(context: vscode.ExtensionContext) {
  const colorLibrary = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  if (Object.keys(colorLibrary).length === 0) {
    context.globalState.update("colorLibrary", getInitialColorLibrary());
  }

  const treeDataProvider = new ColorTreeDataProvider(context);
  vscode.window.createTreeView("colorLibraryView", { treeDataProvider });

  context.subscriptions.push(
    vscode.commands.registerCommand("color-library.saveColor", () =>
      saveColor(context, treeDataProvider),
    ),
    vscode.commands.registerCommand("color-library.insertAll", () =>
      insertAllColors(context),
    ),
    vscode.commands.registerCommand(
      "color-library.insertColor",
      (item?: ColorItem) => insertChosenColor(context, item),
    ),
    vscode.commands.registerCommand("color-library.exportJson", () =>
      exportColorsToJson(context),
    ),
    vscode.commands.registerCommand("color-library.refreshColors", () =>
      treeDataProvider.refresh(),
    ),
    vscode.commands.registerCommand(
      "color-library.deleteColor",
      (item: ColorItem) => {
        const library = context.globalState.get<{
          [folder: string]: { [key: string]: string };
        }>("colorLibrary", {});
        if (library[item.folder]) {
          delete library[item.folder][item.label];
          if (Object.keys(library[item.folder]).length === 0) {
            delete library[item.folder];
          }
          context.globalState.update("colorLibrary", library);
          vscode.window.showInformationMessage(
            `Deleted "${item.label}" from "${item.folder}"`,
          );
          treeDataProvider.refresh();
        }
      },
    ),

    vscode.commands.registerCommand("color-library.clearAllColors", () =>
      clearAllColors(context, treeDataProvider),
    ),
  );
}

export function deactivate() {}

// lots I didn't have time to tackle here, like multiple colors in one line,
// adding a code action if the cursor was in a color, etc.
//
// this could be a lot more frictionless. You shouldn't need to name colors & we should just add to your last used folder.

/// Parse the current line for a color and save it to the library
async function saveColor(
  context: vscode.ExtensionContext,
  tree: ColorTreeDataProvider,
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const line = editor.document.lineAt(editor.selection.active.line);
  const parsed = tryParseColor(line.text);
  if (!parsed) {
    return;
  }
  const name = await vscode.window.showInputBox({ prompt: "Enter color name" });
  if (!name) {
    return;
  }
  const folder =
    (await vscode.window.showInputBox({
      prompt: "Enter folder name (or leave empty for Default)",
    })) || "Default";
  const library = context.globalState.get<{
    [folder: string]: { [key: string]: string };
  }>("colorLibrary", {});
  if (!library[folder]) {
    library[folder] = {};
  }
  library[folder][name] = parsed;
  await context.globalState.update("colorLibrary", library);
  tree.refresh();
  vscode.window.showInformationMessage(
    `Saved: ${name} => ${parsed} in folder ${folder}`,
  );
}

/// Insert the chosen color into the active editor in a format suitable for the current language
async function insertChosenColor(
  context: vscode.ExtensionContext,
  item?: ColorItem,
) {
  if (!item) {
    // If no item is provided, fall back to the original behavior
    let chosenItem = await chooseColor(context);
    if (!chosenItem) {
      return;
    }
    item = chosenItem;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const lang = activeBufferLanguage();
  if (lang && languageIsSupported(lang)) {
    editor.edit((b) =>
      b.insert(
        editor.selection.active,
        colorStringForLanguage(item.color, lang),
      ),
    );
  } else {
    editor.edit((b) => b.insert(editor.selection.active, item.color));
  }
}

/// Choose a color from the library
async function chooseColor(context: vscode.ExtensionContext) {
  const library = context.globalState.get<{
    [folder: string]: { [key: string]: string };
  }>("colorLibrary", {});
  const colorItems: ColorItem[] = [];

  for (const folder in library) {
    for (const color in library[folder]) {
      colorItems.push(new ColorItem(color, library[folder][color], folder));
    }
  }

  if (!colorItems.length) {
    vscode.window.showInformationMessage("No colors saved.");
    return null;
  }

  const chosen = await vscode.window.showQuickPick(
    colorItems.map((item) => ({
      label: item.label,
      description: `${item.color} (${item.folder})`,
      item: item,
    })),
  );

  return chosen ? chosen.item : null;
}

async function clearAllColors(
  context: vscode.ExtensionContext,
  tree: ColorTreeDataProvider,
) {
  const result = await vscode.window.showWarningMessage(
    "Are you sure you want to clear all colors and restore defaults?",
    "Yes",
    "No",
  );
  if (result === "Yes") {
    await context.globalState.update("colorLibrary", getInitialColorLibrary());
    tree.refresh();
    vscode.window.showInformationMessage(
      "All colors have been reset to defaults.",
    );
  }
}

// i didn't get time to wire this up, and didn't want to push too far outside of
// the suggested time. Adding import/export from here would be pretty trivial,
// and make this more useful.
//
// we could also add the ability to import from places like Figma or Sketch
// which would add a lot towards this being something someone would actually
// want to use.
async function exportColorsToJson(context: vscode.ExtensionContext) {
  const library = context.globalState.get<{
    [folder: string]: { [key: string]: string };
  }>("colorLibrary", {});
  const jsonString = JSON.stringify(library, null, 2);

  const saveLocation = await vscode.window.showSaveDialog({
    filters: { JSON: ["json"] },
    defaultUri: vscode.Uri.file("color_library_export.json"),
  });

  if (saveLocation) {
    try {
      await vscode.workspace.fs.writeFile(
        saveLocation,
        Buffer.from(jsonString, "utf8"),
      );
      vscode.window.showInformationMessage(
        "Color library exported successfully!",
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        "Failed to export color library: " + error,
      );
    }
  }
}
