import { TFolder, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import { extractFolderName, getFolderNote } from '../../../functions/folderNoteFunctions';
import {
	sortFiles, filterFiles,
	type FolderOverview, type defaultOverviewSettings,
} from '../FolderOverview';
import { getFolderPathFromString } from '../../../functions/utils';
import type FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';

export async function renderListOverview(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	ctx: MarkdownPostProcessorContext,
	root: HTMLElement,
	yaml: defaultOverviewSettings,
	pathBlacklist: string[],
	folderOverview: FolderOverview,
): Promise<void> {
	const overviewList = folderOverview.listEl;
	const { app } = plugin;
	overviewList?.empty();
	let tFolder = app.vault.getAbstractFileByPath(yaml.folderPath);
	if (!tFolder && yaml.folderPath.trim() === '') {
		if (ctx.sourcePath.includes('/')) {
			tFolder = app.vault.getAbstractFileByPath(getFolderPathFromString(ctx.sourcePath));
		} else {
			yaml.folderPath = '/';
			tFolder = app.vault.getAbstractFileByPath('/');
		}
	}
	if (!(tFolder instanceof TFolder)) { return; }

	let files = tFolder.children;
	if (!files) { return; }
	const ul = folderOverview.listEl;
	const sourceFolderPath = tFolder.path;
	files = await filterFiles(
		files, plugin, sourceFolderPath, yaml.depth,
		folderOverview.pathBlacklist, yaml, folderOverview.sourceFile,
	);

	const folders = sortFiles(
		files.filter((f) => f instanceof TFolder), folderOverview.yaml, plugin,
	);
	files = sortFiles(files.filter((f) => f instanceof TFile), folderOverview.yaml, plugin);
	folders.forEach(async (file) => {
		if (file instanceof TFolder) {
			if (yaml.includeTypes.includes('folder')) {
				const folderItem = await addFolderList(
					plugin, ul, folderOverview.pathBlacklist, file, folderOverview,
				);
				if (!folderItem) { return; }
				goThroughFolders(
					plugin, folderItem, file, folderOverview.yaml.depth, sourceFolderPath, ctx,
					folderOverview.yaml, folderOverview.pathBlacklist,
					folderOverview.yaml.includeTypes, folderOverview.yaml.disableFileTag,
					folderOverview,
				);
			} else {
				goThroughFolders(
					plugin, ul, file, folderOverview.yaml.depth, sourceFolderPath, ctx,
					folderOverview.yaml, folderOverview.pathBlacklist,
					folderOverview.yaml.includeTypes, folderOverview.yaml.disableFileTag,
					folderOverview,
				);
			}
		}
	});

	files.forEach((file) => {
		if (file instanceof TFile) {
			addFileList(
				plugin, ul, folderOverview.pathBlacklist, file,
				folderOverview.yaml.includeTypes,
				folderOverview.yaml.disableFileTag, folderOverview,
			);
		}
	});

	// Event system for rendering list style
	const DEBOUNCE_DELAY = 300;
	const debouncedRenderListOverview = debounce(
		() => renderListOverview(plugin, ctx, root, yaml, pathBlacklist, folderOverview),
		DEBOUNCE_DELAY,
	);
	const handleVaultChange = (): void => {
		debouncedRenderListOverview();
	};

	folderOverview.on('vault-change', handleVaultChange);
}

function debounce(func: Function, wait: number) {
	let timeout: number | undefined;
	return (...args: unknown[]): void => {
		clearTimeout(timeout);
		timeout = window.setTimeout(() => func.apply(this, args), wait);
	};
}

export async function addFolderList(
	plugin: FolderOverviewPlugin | FolderNotesPlugin | FolderNotesPlugin,
	list: HTMLUListElement | HTMLLIElement,
	pathBlacklist: string[],
	folder: TFolder,
	folderOverview: FolderOverview,
): Promise<HTMLLIElement | undefined> {
	folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');
	const folderDepth = folder.path.split('/').length;
	const sourceFolderDepth = folderOverview.yaml.folderPath.split('/').length;
	const isFirstLevelSub = folderDepth === sourceFolderDepth + 1;
	if (!folderOverview.yaml.showEmptyFolders &&
		folder.children.length === 0 &&
		!folderOverview.yaml.onlyIncludeSubfolders) {
		return;
	} else if (folderOverview.yaml.onlyIncludeSubfolders &&
		!isFirstLevelSub &&
		folder.children.length === 0) {
		return;
	}


	const folderItem = list.createEl('li', { cls: 'folder-overview-list folder-list' });
	if (plugin instanceof FolderNotesPlugin) {
		const folderNote = getFolderNote(plugin, folder.path);
		if (folderNote instanceof TFile) {
			const folderNoteLink = folderItem.createEl('a', {
				cls: 'folder-overview-list-item folder-name-item internal-link',
				href: folderNote.path,
			});
			if (folderOverview.yaml.fmtpIntegration) {
				folderNoteLink.innerText =
					await plugin.fmtpHandler?.getNewFileName(folderNote) ?? folder.name;
			} else {
				folderNoteLink.innerText = folder.name;
			}

			pathBlacklist.push(folderNote.path);
			folderNoteLink.oncontextmenu = (e): void => {
				e.stopImmediatePropagation();
				folderOverview.fileMenu(folderNote, e);
			};
		} else {
			const folderName = folderItem.createEl('span', {
				cls: 'folder-overview-list-item folder-name-item',
			});
			folderName.innerText = folder.name;
			folderName.oncontextmenu = (e): void => {
				folderOverview.folderMenu(folder, e);
			};
		}
	} else {
		const folderName = folderItem.createEl('span', {
			cls: 'folder-overview-list-item folder-name-item',
		});
		folderName.innerText = folder.name;
		folderName.oncontextmenu = (e): void => {
			folderOverview.folderMenu(folder, e);
		};
	}

	return folderItem;
}

async function goThroughFolders(
	plugin: FolderOverviewPlugin | FolderNotesPlugin, list: HTMLLIElement | HTMLUListElement,
	folder: TFolder, depth: number, sourceFolderPath: string,
	ctx: MarkdownPostProcessorContext, yaml: defaultOverviewSettings,
	pathBlacklist: string[], includeTypes: string[], disableFileTag: boolean,
	folderOverview: FolderOverview,
): Promise<void> {
	if (sourceFolderPath === '') {
		depth--;
	}

	const allFiles = await filterFiles(
		folder.children, plugin, sourceFolderPath, depth, pathBlacklist, yaml,
		folderOverview.sourceFile,
	);
	const files = sortFiles(
		allFiles.filter((file): file is TFile => !(file instanceof TFolder) && file !== null),
		yaml,
		plugin,
	);

	const folders = sortFiles(
		allFiles.filter((file): file is TFolder => (file instanceof TFolder) && file !== null),
		yaml,
		plugin,
	);
	const ul = list.createEl('ul', { cls: 'folder-overview-list' });

	folders.forEach(async (file) => {
		if (file instanceof TFolder) {
			if (yaml.includeTypes.includes('folder')) {
				const folderItem = await addFolderList(
					plugin, ul, pathBlacklist, file, folderOverview,
				);
				if (!folderItem) { return; }
				goThroughFolders(
					plugin, folderItem, file, depth, sourceFolderPath, ctx, yaml,
					pathBlacklist, includeTypes, disableFileTag, folderOverview,
				);
			} else {
				goThroughFolders(
					plugin, list, file, depth, sourceFolderPath, ctx, yaml,
					pathBlacklist, includeTypes, disableFileTag, folderOverview,
				);
			}
		}
	});

	files.forEach((file) => {
		if (file instanceof TFile) {
			if (yaml.includeTypes.includes('folder')) {
				addFileList(
					plugin, ul, pathBlacklist, file, includeTypes, disableFileTag, folderOverview,
				);
			} else {
				addFileList(
					plugin, list, pathBlacklist, file, includeTypes, disableFileTag, folderOverview,
				);
			}
		}
	});
}

async function addFileList(
	plugin: FolderOverviewPlugin | FolderNotesPlugin, list: HTMLUListElement | HTMLLIElement,
	pathBlacklist: string[], file: TFile, includeTypes: string[],
	disableFileTag: boolean, folderOverview: FolderOverview,
): Promise<void> {
	if (!folderOverview.yaml.showFolderNotes) {
		if (pathBlacklist.includes(file.path)) return;
		if (plugin instanceof FolderNotesPlugin &&
			extractFolderName(plugin.settings.folderNoteName, file.basename) ===
			file.parent?.name) {
			return;
		}
	}

	folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');
	const listItem = list.createEl('li', { cls: 'folder-overview-list file-link' });
	listItem.oncontextmenu = (e): void => {
		e.stopImmediatePropagation();
		folderOverview.fileMenu(file, e);
	};

	const nameItem = listItem.createEl('div', { cls: 'folder-overview-list-item' });
	const link = nameItem.createEl('a', { cls: 'internal-link', href: file.path });
	if (folderOverview.yaml.fmtpIntegration) {
		link.innerText = await plugin.fmtpHandler?.getNewFileName(file) ?? file.basename;
	} else {
		link.innerText = file.basename;
	}

	if (file.extension !== 'md' && !disableFileTag) {
		nameItem.createDiv({ cls: 'nav-file-tag' }).innerText = file.extension;
	}
}
