import type { defaultOverviewSettings, FolderOverview } from '../FolderOverview';
import { filterFiles, sortFiles } from '../FolderOverview';
import type FolderNotesPlugin from '../../../main';
import type FolderOverviewPlugin from '../main';
import type { MarkdownPostProcessorContext, TAbstractFile } from 'obsidian';
import { debounce, TFile, TFolder } from 'obsidian';
import { getFolderPathFromString } from '../utils/functions';

export class CardsOverview {
	plugin: FolderOverviewPlugin | FolderNotesPlugin;
	folderOverview: FolderOverview;
	yaml: defaultOverviewSettings;
	root: HTMLElement;
	ctx: MarkdownPostProcessorContext;

	eventListeners: (() => void)[] = [];
	constructor(folderOverview: FolderOverview) {
		this.plugin = folderOverview.plugin;
		this.folderOverview = folderOverview;
		this.yaml = folderOverview.yaml;
		this.root = folderOverview.root;
		this.ctx = folderOverview.ctx;
	}

	disconnectListeners() {
		this.eventListeners.forEach((unregister) => {
			unregister();
		});
		this.eventListeners = [];
	}

	async render() {
		const overviewList = this.folderOverview.listEl;
		overviewList?.empty();
		if (!overviewList) return;

		let tFolder = this.plugin.app.vault.getAbstractFileByPath(this.yaml.folderPath);
		if (!tFolder && this.yaml.folderPath.trim() === '') {
			if (this.ctx.sourcePath.includes('/')) {
				tFolder = this.plugin.app.vault.getAbstractFileByPath(getFolderPathFromString(this.ctx.sourcePath));
			} else {
				this.yaml.folderPath = '/';
				tFolder = this.plugin.app.vault.getAbstractFileByPath('/');
			}
		}

		if (!(tFolder instanceof TFolder)) return;
		this.root.createDiv({ cls: 'fv-cards-overview' });

		this.eventListeners.push(() => {
			this.folderOverview.off('vault-change', this.handleVaultChange);
		});

		this.folderOverview.on('vault-change', this.handleVaultChange);
		this.addFiles(tFolder.children);
	}

	handleVaultChange() {
		debounce(() => {
			this.render();
		}, 1000)();
	}

	async addFiles(files: TAbstractFile[]) {
		const allFiles = await filterFiles(
			files,
			this.plugin,
			this.yaml.folderPath,
			this.folderOverview.yaml.depth,
			this.folderOverview.pathBlacklist,
			this.folderOverview.yaml,
			this.folderOverview.sourceFile,
		);

		const sortedFiles = sortFiles(
			(allFiles ?? []).filter((file): file is TAbstractFile => file !== null),
			this.folderOverview.yaml,
			this.folderOverview.plugin,
		);

		const folders = sortedFiles.filter((child) => child instanceof TFolder);
		const otherFiles = sortedFiles.filter((child) => child instanceof TFile);

		for (const child of folders) {
			if (!(child instanceof TFolder)) continue;
			await this.createFolderEl(child);
		}

		for (const child of otherFiles) {
			if (!(child instanceof TFile)) continue;
			await this.createFileEl(child);
		}
	}

	async createFolderEl(folder: TFolder) {
		const folderEl = this.root.createDiv({ cls: 'fv-card-folder' });
		folderEl.createEl('h3', { text: folder.name });
		folderEl.createDiv({ cls: 'fv-card-folder-path', text: folder.path });
	}

	async createFileEl(file: TFile) {
		const fileEl = this.root.createDiv({ cls: 'fv-card-file' });
		fileEl.createEl('h3', { text: file.name });
		fileEl.createDiv({ cls: 'fv-card-file-path', text: file.path });
	}
}
