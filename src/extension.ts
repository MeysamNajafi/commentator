import * as vscode from "vscode";
import axios from "axios";

const getApiKey = async () => {
  return await vscode.window.showInputBox({
    title:
      "Commenti use gemini to translate commnets. so you have to obtain an api key and enter it here",
    placeHolder: "Enter gemini api key here",
  });
};

const getApiModel = async () => {
  const items = [
    { label: "gemini-1.5-flash-8b", description: "gemini-1.5-flash-8b" },
    { label: "gemini-2.0-flash", description: "gemini-2.0-flash" },
  ];

  return await vscode.window.showQuickPick(items, {
    title: "Select gemini model:",
  });
};

const getEnvVars = async (context: vscode.ExtensionContext) => {
  const secretStorage = context.secrets;
  const apiKeyName = "api_key";
  const apiModelName = "api_model";

  // Retrieve a secret
  let apiKey = await secretStorage.get(apiKeyName);
  let apiModel = await secretStorage.get(apiModelName);

  if (!apiKey) {
    apiKey = await getApiKey();
    if (apiKey) {
      await secretStorage.store(apiKeyName, apiKey);
    }
  }
  if (!apiModel) {
    const selectedModel = await getApiModel();
    if (selectedModel?.label) {
      apiModel = selectedModel?.label;
      await secretStorage.store(apiModelName, apiModel);
    }
  }

  return { apiModel, apiKey };
};

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "commenti.translateComment",
    async () => {
      const { apiModel, apiKey } = await getEnvVars(context);
      if (!apiKey) {
        return vscode.window.showInformationMessage(
          `Gemini api key is not entered.`
        );
      }
      if (!apiModel) {
        return vscode.window.showInformationMessage(
          `Gemini model is not selected.`
        );
      }

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.selection;

        const lines = [];
        const selectionStart = selection.start.line;
        const selectionEnd = selection.end.line;

        // get lines
        for (let index = selectionStart; index <= selectionEnd; index++) {
          lines.push(editor.document.lineAt(index));
        }

        try {
          const { data } = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`,
            {
              contents: [
                {
                  parts: [
                    {
                      text: `Consider that you are a translator. Translate this text which is persian to english.
                      Delete anything related to programing languages comment notation in the text like // or /* or */
                      Note that the context of this text is about programming.
                      Also insert a \n after each part.`,
                    },
                    ...lines.map((line) => ({ text: line.text })),
                  ],
                },
              ],
            }
          );
          const translatedText = data.candidates[0].content.parts[0].text;

          if (!translatedText) {
            vscode.window.showInformationMessage(`An error occurred!`);
            return;
          }

          const translatedTextAsLines = translatedText
            .split("\n")
            .filter((text: string) => text);

          for await (const [index, line] of lines.entries()) {
            await editor.edit((editBuilder) => {
              editBuilder.replace(
                line.range,
                "// " + translatedTextAsLines[index]
              );
            });
          }
        } catch (err) {
          vscode.window.showInformationMessage(
            `An error occurred while getting response from gemini!`
          );
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
