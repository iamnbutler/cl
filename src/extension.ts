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
    this.tooltip = `${label}: ${color}`;
    this.description = color;
  }
}

const hexColorRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/;
const rgbColorRegex = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/;
const rgbaColorRegex =
  /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?\.?\d*)\s*\)/;

function tryParseColor(line: string) {
  const hex = line.match(hexColorRegex);
  if (hex) return hex[0];
  const rgb = line.match(rgbColorRegex);
  if (rgb) return rgb[0];
  const rgba = line.match(rgbaColorRegex);
  if (rgba) return rgba[0];
  return null;
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
    vscode.commands.registerCommand("color-library.insertColor", () =>
      insertChosenColor(context),
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
  );
}

export function deactivate() {}

async function saveColor(
  context: vscode.ExtensionContext,
  tree: ColorTreeDataProvider,
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const line = editor.document.lineAt(editor.selection.active.line);
  const parsed = tryParseColor(line.text);
  if (!parsed) return;
  const name = await vscode.window.showInputBox({ prompt: "Enter color name" });
  if (!name) return;
  const library = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  library[name] = parsed;
  await context.globalState.update("colorLibrary", library);
  tree.refresh();
  vscode.window.showInformationMessage(`Saved: ${name} => ${parsed}`);
}

async function insertChosenColor(context: vscode.ExtensionContext) {
  const item = await chooseColor(context);
  if (!item) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
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
  if (!chosen) return null;
  return { label: chosen, color: library[chosen] };
}
