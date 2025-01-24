// Credits go to Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes and https://github.com/SilentVoid13/Templater

import { AbstractInputSuggest, TAbstractFile, TFile } from 'obsidian';
import FolderNotesPlugin from '../main';
import FolderOverviewPlugin from '../main';
export enum FileSuggestMode {
    TemplateFiles,
    ScriptFiles,
}

export class FileSuggest extends AbstractInputSuggest<TFile> {
	plugin: FolderNotesPlugin | FolderOverviewPlugin;
	constructor(
        public inputEl: HTMLInputElement,
        plugin: FolderNotesPlugin | FolderOverviewPlugin
	) {
		super(plugin.app, inputEl);
		this.plugin = plugin;
	}

	getSuggestions(input_str: string): TFile[] {
		const files: TFile[] = [];
		const lower_input_str = input_str.toLowerCase();

		this.plugin.app.vault.getFiles().forEach((file: TAbstractFile) => {
			if (
				file instanceof TFile &&
                file.path.toLowerCase().contains(lower_input_str)
			) {
				files.push(file);
			}
		});

		return files;
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		this.inputEl.value = file.path;
		this.inputEl.trigger('input');
		this.close();
	}
}
