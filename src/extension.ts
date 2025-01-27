import * as vscode from "vscode";

const explicitlySupportedLanguages = ["rust", "typescript"] as const;
type SupportedLanguage = (typeof explicitlySupportedLanguages)[number];

const defaultColors: { [key: string]: string } = {
  Red: "#FF0000",
  Green: "#00FF00",
  Blue: "#0000FF",
};

function getInitialColorLibrary(): { [key: string]: string } {
  return { ...defaultColors };
}

class ColorTreeDataProvider implements vscode.TreeDataProvider<ColorItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ColorItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  constructor(private context: vscode.ExtensionContext) {}
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element: ColorItem) {
    return element;
  }
  tryGetTreeItem(input: string): ColorItem | null {
    const colorItem = tryGetColorItem(input, this.context);
    if (colorItem) {
      return colorItem;
    }
    const library = this.context.globalState.get<{ [key: string]: string }>(
      "colorLibrary",
      {},
    );
    const color = library[input];
    if (color) {
      return new ColorItem(input, color);
    }
    return null;
  }
  getChildren() {
    const library = this.context.globalState.get<{ [key: string]: string }>(
      "colorLibrary",
      {},
    );
    return Promise.resolve(
      Object.entries(library).map(
        ([label, color]) => new ColorItem(label, color),
      ),
    );
  }
}

class ColorItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly color: string,
  ) {
    super(label);
    this.contextValue = "colorItem";
    this.description = color;
    this.tooltip = `${label}: ${color}`;
  }
}

const hexColorRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/;
const rgbColorRegex = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/;
const rgbaColorRegex =
  /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?\.?\d*)\s*\)/;

function tryParseColor(line: string) {
  const hex = line.match(hexColorRegex);
  if (hex) {
    return hex[0];
  }
  const rgb = line.match(rgbColorRegex);
  if (rgb) {
    return rgb[0];
  }
  const rgba = line.match(rgbaColorRegex);
  if (rgba) {
    return rgba[0];
  }
  return null;
}

function tryGetColorItem(
  input: string,
  context: vscode.ExtensionContext,
): ColorItem | null {
  const treeDataProvider = new ColorTreeDataProvider(context);
  return treeDataProvider.tryGetTreeItem(input);
}

function activeBufferLanguage() {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId || null;
}

function languageIsSupported(lang: string): lang is SupportedLanguage {
  return explicitlySupportedLanguages.includes(lang as SupportedLanguage);
}

function colorStringForLanguage(color: string, lang: SupportedLanguage) {
  switch (lang) {
    case "rust":
      return `Rgb::new(${color})`;
    case "typescript":
      return color;
  }
}

function allColorsStringForLanguage(
  colors: { [key: string]: string },
  lang: SupportedLanguage,
): string {
  const entries = Object.entries(colors);
  switch (lang) {
    case "rust":
      return `
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Color {
  ${entries.map(([name, _]) => `    ${name},`).join("\n")}
}

impl Color {
  fn rgb(&self) -> Rgb {
      match self {
          ${entries.map(([name, color]) => `            Color::${name} => Rgb::new(${color}),`).join("\n")}
      }
  }

  fn name(&self) -> &'static str {
      match self {
          ${entries.map(([name, _]) => `            Color::${name} => "${name}",`).join("\n")}
      }
  }
}`;
    case "typescript":
      return `
      const colorValues = {
      ${entries.map(([name, color]) => `  "${name}": "${color}"`).join(",\n")}
      } as const;

      type Color = keyof typeof colorValues;`;
    default:
      return entries.map(([name, color]) => color).join("\n");
  }
}

async function insertAllColors(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor");
    return;
  }

  const library = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  if (Object.keys(library).length === 0) {
    vscode.window.showInformationMessage("Color library is empty");
    return;
  }

  const lang = activeBufferLanguage();
  let colorString: string;

  if (lang && languageIsSupported(lang)) {
    colorString = allColorsStringForLanguage(library, lang);
  } else {
    colorString = allColorsStringForLanguage(library, "typescript"); // Default to TypeScript format
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
    vscode.commands.registerCommand("color-library.refreshColors", () =>
      treeDataProvider.refresh(),
    ),
    vscode.commands.registerCommand(
      "color-library.deleteColor",
      (item: ColorItem) => {
        const library = context.globalState.get<{ [key: string]: string }>(
          "colorLibrary",
          {},
        );
        delete library[item.label];
        context.globalState.update("colorLibrary", library);
        vscode.window.showInformationMessage(`Deleted "${item.label}"`);
        treeDataProvider.refresh();
      },
    ),
    vscode.commands.registerCommand("color-library.clearAllColors", () =>
      clearAllColors(context, treeDataProvider),
    ),
  );
}

export function deactivate() {}

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
  const library = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  library[name] = parsed;
  await context.globalState.update("colorLibrary", library);
  tree.refresh();
  vscode.window.showInformationMessage(`Saved: ${name} => ${parsed}`);
}

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

async function chooseColor(context: vscode.ExtensionContext) {
  const library = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  const names = Object.keys(library);
  if (!names.length) {
    vscode.window.showInformationMessage("No colors saved.");
    return null;
  }
  const chosen = await vscode.window.showQuickPick(names);
  if (!chosen) {
    return null;
  }
  return { label: chosen, color: library[chosen] };
}

async function clearAllColors(
  context: vscode.ExtensionContext,
  tree: ColorTreeDataProvider,
) {
  const result = await vscode.window.showWarningMessage(
    "Are you sure you want to clear all colors?",
    "Yes",
    "No",
  );
  if (result === "Yes") {
    await context.globalState.update("colorLibrary", {});
    tree.refresh();
    vscode.window.showInformationMessage("All colors have been cleared.");
  }
}
