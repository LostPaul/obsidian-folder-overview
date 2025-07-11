// Credits go to Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes and https://github.com/SilentVoid13/Templater

import { TAbstractFile, TFolder, AbstractInputSuggest } from 'obsidian';
import FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';
export enum FileSuggestMode {
	TemplateFiles,
	ScriptFiles,
}

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	plugin: FolderOverviewPlugin | FolderNotesPlugin;
	constructor(
		public inputEl: HTMLInputElement,
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		private whitelistSuggester: boolean,
		public folder?: TFolder,
	) {
		super(plugin.app, inputEl);
		this.plugin = plugin;
	}

	getSuggestions(input_str: string): TFolder[] {
		const folders: TFolder[] = [];
		const lower_input_str = input_str.toLowerCase();
		let files: TAbstractFile[] = [];
		if (this.folder) {
			files = this.folder.children;
		} else {
			files = this.plugin.app.vault.getAllLoadedFiles().slice(0, 100);
		}

		// @ts-ignore
		folders.push({ path: 'File’s parent folder path' });

		if (this.plugin instanceof FolderNotesPlugin) {
			// @ts-ignore
			folders.push({ path: 'Path of folder linked to the file' });
		}

		files.forEach((folder: TAbstractFile) => {
			if (
				folder instanceof TFolder &&
				folder.path.toLowerCase().contains(lower_input_str) &&
				(this.plugin instanceof FolderNotesPlugin ? (!this.plugin.settings.excludeFolders.find((f: any) => f.path === folder.path) || this.whitelistSuggester) : true)
			) {
				folders.push(folder);
			}
		});

		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		this.inputEl.trigger('input');
		this.close();
	}
}
