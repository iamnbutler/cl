import * as vscode from "vscode";

const explicitlySupportedLanguages = ["rust", "typescript"] as const;

type SupportedLanguage = (typeof explicitlySupportedLanguages)[number];

class ColorTreeDataProvider implements vscode.TreeDataProvider<ColorItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ColorItem | undefined | null | void
  > = new vscode.EventEmitter<ColorItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ColorItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ColorItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ColorItem): Thenable<ColorItem[]> {
    if (element) {
      return Promise.resolve([]);
    } else {
      const colorLibrary = this.context.globalState.get<{
        [key: string]: string;
      }>("colorLibrary", {});
      return Promise.resolve(
        Object.entries(colorLibrary).map(
          ([name, color]) => new ColorItem(name, color),
        ),
      );
    }
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

/**
 * Returns an array of supported languages the project contains, if any.
 */
async function projectLanguages(): Promise<SupportedLanguage[]> {
  const languages: ("rust" | "typescript")[] = [];

  const rustFiles = await vscode.workspace.findFiles(
    "Cargo.toml",
    "**/node_modules/**",
    1,
  );
  if (rustFiles.length > 0) {
    languages.push("rust");
  }

  const tsconfigFiles = await vscode.workspace.findFiles(
    "tsconfig.json",
    "**/node_modules/**",
    1,
  );
  if (tsconfigFiles.length > 0) {
    languages.push("typescript");
  }

  return languages;
}

/**
 * Returns the language of the active buffer, if any.
 */
function activeBufferLanguage(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  return editor.document.languageId;
}

function languageIsSupported(language: string): language is SupportedLanguage {
  return explicitlySupportedLanguages.includes(language as SupportedLanguage);
}

const hexColorRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/;
const rgbColorRegex = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/;
const rgbaColorRegex =
  /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?\.?\d*)\s*\)/;

function tryParseColor(color: string): string | null {
  if (hexColorRegex.test(color)) {
    return color;
  }

  const rgbMatch = color.match(rgbColorRegex);
  if (rgbMatch) {
    const [_, r, g, b] = rgbMatch;
    return `rgb(${r}, ${g}, ${b})`;
  }

  const rgbaMatch = color.match(rgbaColorRegex);
  if (rgbaMatch) {
    const [_, r, g, b, a] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return null;
}

function colorStringForLanguage(
  color: ColorItem,
  language: SupportedLanguage,
): string {
  let colorValue = color.color;

  switch (language) {
    case "rust":
      return `Rgb::new(${colorValue})`;
    case "typescript":
      return colorValue;
    default:
      return colorValue;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Color Library extension is now active");

  const colorTreeDataProvider = new ColorTreeDataProvider(context);
  vscode.window.createTreeView("colorLibraryView", {
    treeDataProvider: colorTreeDataProvider,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("color-library.saveColor", () =>
      saveColor(context, colorTreeDataProvider),
    ),
    vscode.commands.registerCommand("color-library.insertColor", () =>
      insertChosenColor(context),
    ),
    vscode.commands.registerCommand("color-library.refreshColors", () =>
      colorTreeDataProvider.refresh(),
    ),
    vscode.commands.registerCommand(
      "color-library.deleteColor",
      (item: ColorItem) => {
        const colorLibrary = context.globalState.get<{
          [key: string]: string;
        }>("colorLibrary", {});
        delete colorLibrary[item.label];
        context.globalState.update("colorLibrary", colorLibrary);
        vscode.window.showInformationMessage(`Color "${item.label}" deleted`);
        colorTreeDataProvider.refresh();
      },
    ),
  );
}

async function saveColor(
  context: vscode.ExtensionContext,
  treeDataProvider: ColorTreeDataProvider,
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const line = editor.document.lineAt(editor.selection.active.line);
  const parsedColor = tryParseColor(line.text);

  if (!parsedColor) {
    vscode.window.showInformationMessage("No color found in the current line");
    return;
  }

  const colorName = await vscode.window.showInputBox({
    prompt: "Enter a name for this color",
    placeHolder: "e.g., Primary Blue",
  });

  if (!colorName) {
    vscode.window.showInformationMessage("Color save cancelled");
    return;
  }

  const colorLibrary = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  colorLibrary[colorName] = parsedColor;
  await context.globalState.update("colorLibrary", colorLibrary);

  treeDataProvider.refresh();
  vscode.window.showInformationMessage(
    `Color "${colorName}" saved: ${parsedColor}`,
  );
}

async function chooseColor(
  context: vscode.ExtensionContext,
): Promise<ColorItem | null> {
  const colorLibrary = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  const colorNames = Object.keys(colorLibrary);

  if (colorNames.length === 0) {
    vscode.window.showInformationMessage("No colors saved in the library");
    return null;
  }

  const selectedColorName = await vscode.window.showQuickPick(colorNames, {
    placeHolder: "Select a color to insert",
  });

  if (!selectedColorName) {
    return null;
  }

  return new ColorItem(selectedColorName, colorLibrary[selectedColorName]);
}

async function insertColor(color: ColorItem) {
  const activeLanguage = activeBufferLanguage();
  const editor = vscode.window.activeTextEditor;

  if (editor && activeLanguage && languageIsSupported(activeLanguage)) {
    const formattedColor = colorStringForLanguage(color, activeLanguage);
    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, formattedColor);
    });
  } else if (editor) {
    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, color.color);
    });
  }
}

async function insertChosenColor(context: vscode.ExtensionContext) {
  const color = await chooseColor(context);
  if (color) {
    await insertColor(color);
  }
}

export function deactivate() {}
