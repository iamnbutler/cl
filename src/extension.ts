import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("Color Library extension is now active");

  context.subscriptions.push(
    vscode.commands.registerCommand("color-library.saveColor", saveColor),
    vscode.commands.registerCommand("color-library.insertColor", insertColor),
    vscode.commands.registerCommand("color-library.previewColor", previewColor),
    vscode.commands.registerCommand(
      "color-library.createCollection",
      createCollection,
    ),
    vscode.commands.registerCommand(
      "color-library.insertCollection",
      insertCollection,
    ),
  );
}

function saveColor() {
  // TODO: Get cursor position, extract color, save to library
}

function insertColor() {
  // TODO: Show color picker, insert selected color at cursor
}

function previewColor() {
  // TODO: Show color preview, offer conversion options
}

function createCollection() {
  // TODO: Create and name a new color collection
}

function insertCollection() {
  // TODO: Insert all colors from a selected collection
}

// Helper functions

function getProjectInfo() {
  // TODO: Detect project languages and file types
}

function getCursorContext() {
  // TODO: Analyze cursor position (in color, in string, etc.)
}

function detectLanguage() {
  // TODO: Identify current file language for proper color format
}

export function deactivate() {}
