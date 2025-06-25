import FolderNotesPlugin from '../../main';
import FolderOverviewPlugin from './main';
import { Menu, Editor, MarkdownView, stringifyYaml } from 'obsidian';

export function registerOverviewCommands(plugin: FolderOverviewPlugin | FolderNotesPlugin) {
	plugin.addCommand({
		id: 'open-folder-overview-settings',
		name: 'Edit folder overview',
		callback: () => {
			plugin.activateOverviewView();
		},
	});

	plugin.addCommand({
		id: 'insert-folder-overview',
		name: 'Insert folder overview',
		editorCheckCallback: (checking: boolean, editor: Editor) => {
			const line = editor.getCursor().line;
			const lineText = editor.getLine(line);
			if (lineText.trim() === '' || lineText.trim() === '>') {
				if (!checking) {
					const json = Object.assign({}, plugin instanceof FolderOverviewPlugin ? plugin.settings : plugin.settings.defaultOverview);
					json.id = crypto.randomUUID();
					const yaml = stringifyYaml(json);
					const overviewBlock = `\`\`\`folder-overview\n${yaml}\`\`\`\n`;
					// overviewBlock = `${overviewBlock}%% folder overview links start %%\n%% folder overview links end %%\n`;

					if (lineText.trim() === '') {
						editor.replaceSelection(overviewBlock);
					} else if (lineText.trim() === '>') {
						// add > to the beginning of each line
						const lines = yaml.split('\n');
						const newLines = lines.map((line) => {
							return `> ${line}`;
						});
						const quotedBlock = `\`\`\`folder-overview\n${newLines.join('\n')}\`\`\`\n`;
						// quotedBlock = `${quotedBlock}%% folder overview links start %%\n %% folder overview links end %%\n`;
						editor.replaceSelection(quotedBlock);
					}
				}
				return true;
			}
			return false;
		},
	});

	plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
		const line = editor.getCursor().line;
		const lineText = editor.getLine(line);
		if (lineText.trim() === '' || lineText.trim() === '>') {
			menu.addItem((item) => {
				item.setTitle('Insert folder overview')
					.setIcon('edit')
					.onClick(() => {
						const json = Object.assign({}, plugin instanceof FolderOverviewPlugin ? plugin.settings : plugin.settings.defaultOverview);
						json.id = crypto.randomUUID();
						const yaml = stringifyYaml(json);
						const overviewBlock = `\`\`\`folder-overview\n${yaml}\`\`\`\n`;
						// overviewBlock = `${overviewBlock}%% folder overview links start %%\n%% folder overview links end %%\n`;

						if (lineText.trim() === '') {
							editor.replaceSelection(overviewBlock);
						} else if (lineText.trim() === '>') {
							// add > to the beginning of each line
							const lines = yaml.split('\n');
							const newLines = lines.map((line) => {
								return `> ${line}`;
							});
							const quotedBlock = `\`\`\`folder-overview\n${newLines.join('\n')}\`\`\`\n`;
							// quotedBlock = `${quotedBlock}%% folder overview links start %%\n %% folder overview links end %%\n`;
							editor.replaceSelection(quotedBlock);
						}
					});
			});
		}
	}));
}
