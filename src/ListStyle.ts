import { MarkdownPostProcessorContext, TFolder, TFile } from 'obsidian';
import { extractFolderName, getFolderNote } from '../../functions/folderNoteFunctions';
import { FolderOverview, overviewSettings } from './FolderOverview';
import { getFolderPathFromString } from '../../functions/utils';
import FolderOverviewPlugin from './main';
import FolderNotesPlugin from '../../main';

export async function renderListOverview(plugin: FolderOverviewPlugin | FolderNotesPlugin, ctx: MarkdownPostProcessorContext, root: HTMLElement, yaml: overviewSettings, pathBlacklist: string[], folderOverview: FolderOverview) {
	const overviewList = folderOverview.listEl;
	overviewList?.empty();
	let tFolder = plugin.app.vault.getAbstractFileByPath(yaml.folderPath);
	if (!tFolder && yaml.folderPath.trim() === '') {
		if (ctx.sourcePath.includes('/')) {
			tFolder = plugin.app.vault.getAbstractFileByPath(getFolderPathFromString(ctx.sourcePath));
		} else {
			yaml.folderPath = '/';
			tFolder = plugin.app.vault.getAbstractFileByPath('/');
		}
	}
	if (!(tFolder instanceof TFolder)) { return; }

	let files = tFolder.children;
	if (!files) { return; }
	const ul = folderOverview.listEl;
	const sourceFolderPath = tFolder.path;
	files = await folderOverview.filterFiles(files, plugin, sourceFolderPath, yaml.depth, folderOverview.pathBlacklist);

	const folders = folderOverview.sortFiles(files.filter((f) => f instanceof TFolder));
	files = folderOverview.sortFiles(files.filter((f) => f instanceof TFile));
	folders.forEach(async (file) => {
		if (file instanceof TFolder) {
			if (yaml.includeTypes.includes('folder')) {
				const folderItem = await addFolderList(plugin, ul, folderOverview.pathBlacklist, file, folderOverview);
				if (!folderItem) { return; }
				goThroughFolders(plugin, folderItem, file, folderOverview.yaml.depth, sourceFolderPath, ctx, folderOverview.yaml, folderOverview.pathBlacklist, folderOverview.yaml.includeTypes, folderOverview.yaml.disableFileTag, folderOverview);
			} else {
				goThroughFolders(plugin, ul, file, folderOverview.yaml.depth, sourceFolderPath, ctx, folderOverview.yaml, folderOverview.pathBlacklist, folderOverview.yaml.includeTypes, folderOverview.yaml.disableFileTag, folderOverview);
			}
		}
	});

	files.forEach((file) => {
		if (file instanceof TFile) {
			addFileList(plugin, ul, folderOverview.pathBlacklist, file, folderOverview.yaml.includeTypes, folderOverview.yaml.disableFileTag, folderOverview);
		}
	});

	// Event system for rendering list style
	const debouncedRenderListOverview = debounce(() => renderListOverview(plugin, ctx, root, yaml, pathBlacklist, folderOverview), 300);
	const handleVaultChange = () => {
		debouncedRenderListOverview();
	};

	folderOverview.on('vault-change', handleVaultChange);
}

function debounce(func: Function, wait: number) {
	let timeout: number | undefined;
	return (...args: any[]) => {
		clearTimeout(timeout);
		timeout = window.setTimeout(() => func.apply(this, args), wait);
	};
}

export async function addFolderList(plugin: FolderOverviewPlugin | FolderNotesPlugin | FolderNotesPlugin, list: HTMLUListElement | HTMLLIElement, pathBlacklist: string[], folder: TFolder, folderOverview: FolderOverview) {
	folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');
	const isFirstLevelSub = folder.path.split('/').length === folderOverview.yaml.folderPath.split('/').length + 1;
	if (!folderOverview.yaml.showEmptyFolders && folder.children.length === 0 && !folderOverview.yaml.onlyIncludeSubfolders) {
		return;
	} else if (folderOverview.yaml.onlyIncludeSubfolders && !isFirstLevelSub && folder.children.length === 0) {
		return;
	}


	const folderItem = list.createEl('li', { cls: 'folder-overview-list folder-list' });
	if (plugin instanceof FolderNotesPlugin) {
		const folderNote = getFolderNote(plugin, folder.path);
		if (folderNote instanceof TFile) {
			const folderNoteLink = folderItem.createEl('a', { cls: 'folder-overview-list-item folder-name-item internal-link', href: folderNote.path });
			if (folderOverview.yaml.fmtpIntegration) {
				folderNoteLink.innerText = await plugin.fmtpHandler?.getNewFileName(folderNote) ?? folder.name;
			} else {
				folderNoteLink.innerText = folder.name;
			}

			pathBlacklist.push(folderNote.path);
			folderNoteLink.oncontextmenu = (e) => {
				e.stopImmediatePropagation();
				folderOverview.fileMenu(folderNote, e);
			};
		} else {
			const folderName = folderItem.createEl('span', { cls: 'folder-overview-list-item folder-name-item' });
			folderName.innerText = folder.name;
			folderName.oncontextmenu = (e) => {
				folderOverview.folderMenu(folder, e);
			};
		}
	} else {
		const folderName = folderItem.createEl('span', { cls: 'folder-overview-list-item folder-name-item' });
		folderName.innerText = folder.name;
		folderName.oncontextmenu = (e) => {
			folderOverview.folderMenu(folder, e);
		};
	}

	return folderItem;
}

async function goThroughFolders(plugin: FolderOverviewPlugin | FolderNotesPlugin, list: HTMLLIElement | HTMLUListElement, folder: TFolder,
	depth: number, sourceFolderPath: string, ctx: MarkdownPostProcessorContext, yaml: overviewSettings,
	pathBlacklist: string[], includeTypes: string[], disableFileTag: boolean, folderOverview: FolderOverview) {
	if (sourceFolderPath === '') {
		depth--;
	}

	const allFiles = await folderOverview.filterFiles(folder.children, plugin, sourceFolderPath, depth, pathBlacklist);
	const files = folderOverview.sortFiles(allFiles.filter((file): file is TFile => !(file instanceof TFolder) && file !== null));

	const folders = folderOverview.sortFiles(allFiles.filter((file): file is TFile => (file instanceof TFolder) && file !== null));
	const ul = list.createEl('ul', { cls: 'folder-overview-list' });

	folders.forEach(async (file) => {
		if (file instanceof TFolder) {
			if (yaml.includeTypes.includes('folder')) {
				const folderItem = await addFolderList(plugin, ul, pathBlacklist, file, folderOverview);
				if (!folderItem) { return; }
				goThroughFolders(plugin, folderItem, file, depth, sourceFolderPath, ctx, yaml, pathBlacklist, includeTypes, disableFileTag, folderOverview);
			} else {
				goThroughFolders(plugin, list, file, depth, sourceFolderPath, ctx, yaml, pathBlacklist, includeTypes, disableFileTag, folderOverview);
			}
		}
	});

	files.forEach((file) => {
		if (file instanceof TFile) {
			if (yaml.includeTypes.includes('folder')) {
				addFileList(plugin, ul, pathBlacklist, file, includeTypes, disableFileTag, folderOverview);
			} else {
				addFileList(plugin, list, pathBlacklist, file, includeTypes, disableFileTag, folderOverview);
			}
		}
	});
}

async function addFileList(plugin: FolderOverviewPlugin | FolderNotesPlugin, list: HTMLUListElement | HTMLLIElement, pathBlacklist: string[], file: TFile, includeTypes: string[], disableFileTag: boolean, folderOverview: FolderOverview) {
	if (includeTypes.length > 0 && !includeTypes.includes('all')) {
		if (file.extension === 'md' && !includeTypes.includes('markdown')) return;
		if (file.extension === 'canvas' && !includeTypes.includes('canvas')) return;
		if (file.extension === 'pdf' && !includeTypes.includes('pdf')) return;
		const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
		if (imageTypes.includes(file.extension) && !includeTypes.includes('image')) return;
		const videoTypes = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
		if (videoTypes.includes(file.extension) && !includeTypes.includes('video')) return;
		const audioTypes = ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus'];
		if (audioTypes.includes(file.extension) && includeTypes.includes('audio')) return;
		const allTypes = ['md', 'canvas', 'pdf', ...imageTypes, ...videoTypes, ...audioTypes];
		if (!allTypes.includes(file.extension) && !includeTypes.includes('other')) return;
	}

	if (!folderOverview.yaml.showFolderNotes) {
		if (pathBlacklist.includes(file.path)) return;
		if (plugin instanceof FolderNotesPlugin && extractFolderName(plugin.settings.folderNoteName, file.basename) === file.parent?.name) {
			return;
		}
	}

	folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');
	const listItem = list.createEl('li', { cls: 'folder-overview-list file-link' });
	listItem.oncontextmenu = (e) => {
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
