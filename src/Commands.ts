import type FolderNotesPlugin from '../../main';
import { type defaultOverviewSettings } from './FolderOverview';
import FolderOverviewPlugin from './main';
import { stringifyYaml, Notice, type Menu, type Editor, type MarkdownView } from 'obsidian';

export function registerOverviewCommands(plugin: FolderOverviewPlugin | FolderNotesPlugin): void {
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
					insertOverview(editor, plugin);
				}
				return true;
			}
			return false;
		},
	});

	plugin.registerEvent(
		// eslint-disable-next-line max-len
		plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, _view: MarkdownView) => {
			const { line } = editor.getCursor();
			const lineText = editor.getLine(line);
			if (lineText.trim() === '' || lineText.trim() === '>') {
				menu.addItem((item) => {
					item.setTitle('Insert folder overview')
						.setIcon('edit')
						.onClick(() => {
							// @ts-expect-error - this is a workaround for the first time insert overview
							if (plugin.settings.firstTimeInsertOverview) {
								// @ts-expect-error - this is a workaround for the first time insert overview
								plugin.settings.firstTimeInsertOverview = false;
								plugin.saveSettings();
								const frag = document.createDocumentFragment();
								const text = document.createTextNode(
									// eslint-disable-next-line max-len
									'You can edit the overview using the "Edit folder overview" command from the command palette. To find more about folder overview, check the plugin documentation: ',
								);
								const link = document.createElement('a');
								// eslint-disable-next-line max-len
								link.href = 'https://lostpaul.github.io/obsidian-folder-notes/Folder%20overview/';
								// eslint-disable-next-line max-len
								link.textContent = 'https://lostpaul.github.io/obsidian-folder-notes/Folder%20overview/';
								frag.appendChild(text);
								frag.appendChild(link);
								new Notice(frag);
							}
							insertOverview(editor, plugin);
						});
				});
			}
		},
		),
	);
}

function insertOverview(
	editor: Editor,
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
): void {
	const { line: cursorLine } = editor.getCursor();
	const currentLineText = editor.getLine(cursorLine);

	const json = getDefaultOverviewJson(plugin);
	json.id = crypto.randomUUID();

	const yaml = stringifyYaml(json);
	let overviewBlock = getOverviewBlock(yaml);

	if (shouldUseActualLinks(plugin)) {
		overviewBlock = addLinkSpans(overviewBlock, json.id);
	}

	if (currentLineText.trim() === '') {
		editor.replaceSelection(overviewBlock);
	} else if (currentLineText.trim() === '>') {
		const yamlLines = yaml.split('\n');
		const quotedLines = yamlLines.map((yamlLine) => `> ${yamlLine}`);
		let quotedBlock = `\`\`\`folder-overview\n${quotedLines.join('\n')}\`\`\`\n`;
		if (shouldUseActualLinks(plugin)) {
			quotedBlock = addLinkSpans(quotedBlock, json.id);
		}
		editor.replaceSelection(quotedBlock);
	}

	if (plugin.fvIndexDB.active) {
		const activeFile = plugin.app.workspace.getActiveFile();
		if (activeFile) {
			plugin.fvIndexDB.addNote(activeFile);
		}
	}
}

function getDefaultOverviewJson(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
): defaultOverviewSettings {
	const isOverviewPlugin = plugin instanceof FolderOverviewPlugin;
	const defaultSettings = isOverviewPlugin
		? plugin.settings.defaultOverviewSettings
		: plugin.settings.defaultOverview;
	return Object.assign({}, defaultSettings);
}

function shouldUseActualLinks(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
): boolean {
	if (plugin instanceof FolderOverviewPlugin) {
		return plugin.settings.defaultOverviewSettings.useActualLinks;
	}
	return plugin.settings.defaultOverview.useActualLinks;
}

function getOverviewBlock(yaml: string): string {
	return `\`\`\`folder-overview\n${yaml}\`\`\`\n`;
}

function addLinkSpans(block: string, id: string): string {
	return (
		`${block}<span class="fv-link-list-start" id="${id}"></span>\n` +
		`<span class="fv-link-list-end" id="${id}"></span>\n`
	);
}
