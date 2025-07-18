import { defaultOverviewSettings, filterFiles, getAllFiles, getOverviews, hasOverviewYaml, sortFiles, updateLinkList } from '../FolderOverview';
import FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';
import { TAbstractFile, TFile, TFolder } from 'obsidian';

export function getFolderPathFromString(path: string): string {
	const subString = path.lastIndexOf('/') >= 0 ? path.lastIndexOf('/') : 0;
	const folderPath = path.substring(0, subString);
	if (folderPath === '') {
		return '/';
	} else {
		return folderPath;
	}
}

export async function updateAllOverviews(plugin: FolderOverviewPlugin | FolderNotesPlugin) {
	const filePaths = await plugin.fvIndexDB.getAllNotes();
	if (filePaths.length === 0) return;
	filePaths.forEach(async (filePath) => {
		const file = plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			plugin.fvIndexDB.removeNote(filePath);
			return;
		}

		if (!hasOverviewYaml(this, file)) {
			plugin.fvIndexDB.removeNote(file.path);
			return;
		}

		const overviews = await getOverviews(this, file) as any as defaultOverviewSettings[];
		overviews.forEach(async (overview) => {
			if (!overview.useActualLinks) return;
			let files: TAbstractFile[] = [];
			let sourceFolderPath = overview.folderPath.trim();
			if (!sourceFolderPath.includes('/')) {
				sourceFolderPath = '/';
			}

			const sourceFolder = this.app.vault.getAbstractFileByPath(sourceFolderPath);
			if (!(sourceFolder instanceof TFolder) && sourceFolderPath !== '/') { return; }

			if (sourceFolder?.path === '/') {
				const rootFiles: TAbstractFile[] = [];
				plugin.app.vault.getAllLoadedFiles().filter((f) => f.parent?.path === '/').forEach((file) => {
					if (!file.path.includes('/')) {
						rootFiles.push(file);
					}
				});
				files = rootFiles;
			} else if (sourceFolder instanceof TFolder) {
				files = sourceFolder.children;
			}

			files = getAllFiles(files, sourceFolderPath, overview.depth);
			files = (await filterFiles(files, this, sourceFolderPath, overview.depth, [], overview, file)).filter((file): file is TAbstractFile => file !== null);
			if (!overview.includeTypes.includes('folder')) {
				files = getAllFiles(files, sourceFolderPath, overview.depth);
			}

			files = sortFiles(files, overview, this);

			updateLinkList(files, this, overview, [], file);
		});
	});
}
