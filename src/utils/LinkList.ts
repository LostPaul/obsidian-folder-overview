import { TFile, TFolder, type TAbstractFile } from 'obsidian';
import type FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';
import { filterFiles, sortFiles, type defaultOverviewSettings } from '../FolderOverview';
import { getFolderNote } from '../../../functions/folderNoteFunctions';

export function buildLinkListBlock(id: string, calloutFlag: boolean): string {
	if (calloutFlag) {
		return (
			'\n> <span class="fv-link-list-start" id="' +
			id +
			'"></span>\n> <span class="fv-link-list-end" id="' +
			id +
			'"></span>'
		);
	}

	return (
		'\n<span class="fv-link-list-start" id="' +
		id +
		'"></span>\n<span class="fv-link-list-end" id="' +
		id +
		'"></span>'
	);
}

export function updateLinkList(
	files: TAbstractFile[] = [],
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	yaml: defaultOverviewSettings,
	pathBlacklist: string[],
	sourceFile: TFile,
): void {
	buildLinkList(files, plugin, yaml, pathBlacklist, sourceFile).then((fileLinks: string[]) => {
		plugin.app.vault.process(sourceFile, (text) => {
			const lines = text.split('\n');
			const linkListStart = `${yaml.isInCallout ? '> ' : ''
				// eslint-disable-next-line indent
				}<span class="fv-link-list-start" id="${yaml.id}"></span>`;
			const linkListEnd =
				`${yaml.isInCallout ? '> ' : ''}` +
				`<span class="fv-link-list-end" id="${yaml.id}"></span>`;

			const startIdx = lines.findIndex((l) => l.trim() === linkListStart);
			const endIdx = lines.findIndex((l) => l.trim() === linkListEnd);

			const NOT_FOUND = -1;
			const linkListExists = startIdx !== NOT_FOUND && endIdx !== NOT_FOUND;
			const isInvalidLinkList = endIdx < startIdx;
			if (!linkListExists || isInvalidLinkList) {
				return text;
			}

			lines.splice(startIdx, endIdx - startIdx + 1);

			// Add the file/folder links into the text
			const newBlock = [
				linkListStart,
				...fileLinks,
				linkListEnd,
			];
			lines.splice(startIdx, 0, ...newBlock);

			return lines.join('\n');
		});
	});
}

async function buildLinkList(
	items: TAbstractFile[],
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	yaml: defaultOverviewSettings,
	pathBlacklist: string[],
	sourceFile: TFile,
	indent = 0,
): Promise<string[]> {
	const result: string[] = [];
	const filtered = (
		await filterFiles(
			items,
			plugin,
			yaml.folderPath,
			yaml.depth,
			pathBlacklist,
			yaml,
			sourceFile,
		)
	).filter((file): file is TAbstractFile => file !== null);

	const sorted = sortFiles(filtered, yaml, plugin);

	for (const item of sorted) {
		const indentStr = '\t'.repeat(indent);

		if (item instanceof TFile) {
			result.push(
				buildFileLinkListLine(item, yaml, indentStr),
			);
		} else if (item instanceof TFolder) {
			const folderLines = await buildFolderLinkListLines(
				item, plugin, yaml, pathBlacklist, sourceFile,
				indentStr, indent,
			);
			result.push(...folderLines);
		}
	}
	return result;
}

function buildFileLinkListLine(
	item: TFile,
	yaml: defaultOverviewSettings,
	indentStr: string,
): string {
	const prefix = yaml.isInCallout ? '> ' : '';
	const base = `${prefix}${indentStr}- [[${item.path}|${item.basename}]]`;
	if (yaml.hideLinkList) {
		return (
			base +
			' <span class="fv-link-list-item"></span>'
		);
	}
	return base;
}

async function buildFolderLinkListLines(
	item: TFolder,
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	yaml: defaultOverviewSettings,
	pathBlacklist: string[],
	sourceFile: TFile,
	indentStr: string,
	indent: number,
): Promise<string[]> {
	const lines: string[] = [];
	const prefix = yaml.isInCallout ? '> ' : '';
	let line = `${prefix}${indentStr}- ${item.name}`;
	let folderNote: TFile | null | undefined = null;

	if (plugin instanceof FolderNotesPlugin) {
		folderNote = getFolderNote(plugin, item.path);
	}

	if (folderNote) {
		line = `${prefix}${indentStr}- [[${folderNote.path}|${item.name}]]`;
	}

	if (yaml.hideLinkList) {
		line += ' <span class="fv-link-list-item"></span>';
	}
	lines.push(line);

	const children = item.children.filter(
		(child) =>
			!(
				child instanceof TFile &&
				folderNote &&
				child.path === folderNote.path
			),
	);
	if (children.length > 0) {
		const childLinks = await buildLinkList(
			children,
			plugin, yaml, pathBlacklist,
			sourceFile, indent + 1,
		);
		lines.push(...childLinks);
	}
	return lines;
}


export function removeLinkList(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	sourceFile: TFile | undefined, yaml: defaultOverviewSettings,
): void {
	if (sourceFile) {
		plugin.app.vault.process(sourceFile, (text) => {
			const lines = text.split('\n');
			const linkListStart = `${yaml.isInCallout ? '> ' : ''
			}<span class="fv-link-list-start" id="${yaml.id
			}"></span>`;
			const linkListEnd = `${yaml.isInCallout ? '> ' : ''}` +
				`<span class="fv-link-list-end" id="${yaml.id}"></span>`;

			const startIdx = lines.findIndex((l) => l.trim() === linkListStart);
			const endIdx = lines.findIndex((l) => l.trim() === linkListEnd);

			const NOT_FOUND = -1;
			const linkListExists = startIdx !== NOT_FOUND && endIdx !== NOT_FOUND;
			const isInvalidLinkList = endIdx < startIdx;

			if (!linkListExists || isInvalidLinkList) {
				return text;
			}

			lines.splice(startIdx, endIdx - startIdx + 1);
			return lines.join('\n');
		});
	}
}
