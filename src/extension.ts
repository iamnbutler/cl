import * as vscode from "vscode";
import chroma from "chroma-js";

const explicitlySupportedLanguages = [
  "rust",
  "typescript",
  "css",
  "json",
] as const;
type SupportedLanguage = (typeof explicitlySupportedLanguages)[number];

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
  Dark0Hard: "#1d2021",
  Dark0: "#282828",
  Dark0Soft: "#32302f",
  Dark1: "#3c3836",
  Dark2: "#504945",
  Dark3: "#665c54",
  Dark4: "#7c6f64",
  Gray: "#928374",
  Light0Hard: "#f9f5d7",
  Light0: "#fbf1c7",
  Light0Soft: "#f2e5bc",
  Light1: "#ebdbb2",
  Light2: "#d5c4a1",
  Light3: "#bdae93",
  Light4: "#a89984",
  BrightRed: "#fb4934",
  BrightGreen: "#b8bb26",
  BrightYellow: "#fabd2f",
  BrightBlue: "#83a598",
  BrightPurple: "#d3869b",
  BrightAqua: "#8ec07c",
  BrightOrange: "#fe8019",
  NeutralRed: "#cc241d",
  NeutralGreen: "#98971a",
  NeutralYellow: "#d79921",
  NeutralBlue: "#458588",
  NeutralPurple: "#b16286",
  NeutralAqua: "#689d6a",
  NeutralOrange: "#d65d0e",
};

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

function createColorIcon(color: string): vscode.Uri {
  const svg = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
    <rect width="14" height="14" x="1" y="1" fill="${color}" stroke="white" stroke-width="1" stroke-opacity="0.1" rx="2" ry="2" />
</svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return vscode.Uri.parse(`data:image/svg+xml;base64,${base64}`);
}

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
