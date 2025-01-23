import * as vscode from "vscode";
import * as path from "path";

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
      insertColor(context),
    ),
    vscode.commands.registerCommand("color-library.refreshColors", () =>
      colorTreeDataProvider.refresh(),
    ),
  );
}

// Regular expressions for color matching
const hexColorRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/;
const rgbColorRegex = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/;
const rgbaColorRegex =
  /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01]?\.?\d*)\s*\)/;

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
  const colorMatch =
    line.text.match(hexColorRegex) ||
    line.text.match(rgbColorRegex) ||
    line.text.match(rgbaColorRegex);

  if (!colorMatch) {
    vscode.window.showInformationMessage("No color found in the current line");
    return;
  }

  const color = colorMatch[0];
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
  colorLibrary[colorName] = color;
  await context.globalState.update("colorLibrary", colorLibrary);

  treeDataProvider.refresh();
  vscode.window.showInformationMessage(`Color "${colorName}" saved: ${color}`);
}

async function insertColor(context: vscode.ExtensionContext) {
  const colorLibrary = context.globalState.get<{ [key: string]: string }>(
    "colorLibrary",
    {},
  );
  const colorNames = Object.keys(colorLibrary);

  if (colorNames.length === 0) {
    vscode.window.showInformationMessage("No colors saved in the library");
    return;
  }

  const selectedColorName = await vscode.window.showQuickPick(colorNames, {
    placeHolder: "Select a color to insert",
  });

  if (!selectedColorName) {
    return;
  }

  const color = colorLibrary[selectedColorName];
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, color);
    });
  }
}

export function deactivate() {}
