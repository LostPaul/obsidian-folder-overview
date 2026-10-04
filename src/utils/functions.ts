import {
	type defaultOverviewSettings,
	type includeTypes,
	filterFiles, getAllFiles, getInitialFiles,
	getOverviews, hasOverviewYaml,
	resolveSourceFolder, sortFiles,
} from '../FolderOverview';
import { buildLinkListBlock, updateLinkList } from './LinkList';
import type FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';
import {
	type MarkdownPostProcessorContext,
	parseYaml,
	stringifyYaml,
	TFile,
	type TFolder,
} from 'obsidian';

export function getFolderPathFromString(path: string): string {
	const subString = path.lastIndexOf('/') >= 0 ? path.lastIndexOf('/') : 0;
	const folderPath = path.substring(0, subString);
	if (folderPath === '') {
		return '/';
	}
	return folderPath;
}

const CODE_BLOCK_END_NOT_FOUND = -1;

const MAX_CODE_BLOCK_SEARCH_COUNT = 50;

export function getCodeBlockEndLine(text: string, startLine: number, count = 1): number {
	let line = startLine + 1;
	const lines = text.split('\n');
	while (line < lines.length) {
		if (count > MAX_CODE_BLOCK_SEARCH_COUNT) {
			return CODE_BLOCK_END_NOT_FOUND;
		}
		if (lines[line].startsWith('```')) {
			return line;
		}
		line++;
		count++;
	}
	return line;
}


export async function updateAllOverviews(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
): Promise<void> {
	const filePaths = await plugin.fvIndexDB.getAllNotes();
	if (filePaths.length === 0) return;
	const defaultSettings = plugin instanceof FolderNotesPlugin
		? plugin.settings.defaultOverview
		: plugin.settings.defaultOverviewSettings;
	filePaths.forEach(async (filePath) => {
		const file = plugin.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			plugin.fvIndexDB.removeNote(filePath);
			return;
		}

		if (!await hasOverviewYaml(plugin, file)) {
			plugin.fvIndexDB.removeNote(file.path);
			return;
		}

		const overviews = await getOverviews(plugin, file);
		overviews.forEach(async (overview) => {
			// Build the link list exactly like the rendered overview does, otherwise opening the
			// note and this background update keep overwriting each other's link list.
			const yaml = buildYamlConfig(
				overview,
				defaultSettings,
				{ sourcePath: file.path },
				overview.includeTypes || defaultSettings.includeTypes || ['folder', 'markdown'],
			);
			if (!yaml.useActualLinks) return;

			const sourceFolder = resolveSourceFolder(plugin, yaml, file, file.path);
			if (!sourceFolder) return;

			let files = await filterFiles(
				getInitialFiles(plugin, sourceFolder),
				plugin,
				sourceFolder.path,
				yaml.depth,
				[],
				yaml,
				file,
			);
			if (!yaml.includeTypes.includes('folder')) {
				files = getAllFiles(files, sourceFolder.path, yaml.depth);
			}

			files = sortFiles(files, yaml, plugin);

			updateLinkList(files, plugin, yaml, [], file);
		});
	});
}


// eslint-disable-next-line complexity
export function buildYamlConfig(
	yaml: defaultOverviewSettings,
	defaultSettings: defaultOverviewSettings,
	ctx: Pick<MarkdownPostProcessorContext, 'sourcePath'>,
	includeTypesParam: includeTypes[],
): defaultOverviewSettings {
	return {
		id: yaml?.id ?? crypto.randomUUID(),
		folderPath:
			yaml?.folderPath?.trim() ??
			getFolderPathFromString(ctx.sourcePath),
		title: yaml?.title ?? defaultSettings.title,
		showTitle: yaml?.showTitle ?? defaultSettings.showTitle,
		depth: yaml?.depth ?? defaultSettings.depth,
		style: yaml?.style ?? 'list',
		includeTypes: includeTypesParam.map((type) =>
			type.toLowerCase(),
		) as includeTypes[],
		disableFileTag:
			yaml?.disableFileTag ?? defaultSettings.disableFileTag,
		sortBy: yaml?.sortBy ?? defaultSettings.sortBy,
		sortByAsc: yaml?.sortByAsc ?? defaultSettings.sortByAsc,
		showEmptyFolders:
			yaml?.showEmptyFolders ?? defaultSettings.showEmptyFolders,
		onlyIncludeSubfolders:
			yaml?.onlyIncludeSubfolders ??
			defaultSettings.onlyIncludeSubfolders,
		storeFolderCondition:
			yaml?.storeFolderCondition ??
			defaultSettings.storeFolderCondition,
		showFolderNotes:
			yaml?.showFolderNotes ?? defaultSettings.showFolderNotes,
		disableCollapseIcon:
			yaml?.disableCollapseIcon ??
			defaultSettings.disableCollapseIcon,
		alwaysCollapse:
			yaml?.alwaysCollapse ?? defaultSettings.alwaysCollapse,
		autoSync: yaml?.autoSync ?? defaultSettings.autoSync,
		allowDragAndDrop:
			yaml?.allowDragAndDrop ?? defaultSettings.allowDragAndDrop,
		hideLinkList:
			yaml?.hideLinkList ?? defaultSettings.hideLinkList,
		hideFolderOverview:
			yaml?.hideFolderOverview ??
			defaultSettings.hideFolderOverview,
		useActualLinks:
			yaml?.useActualLinks ?? defaultSettings.useActualLinks,
		fmtpIntegration:
			yaml?.fmtpIntegration ?? defaultSettings.fmtpIntegration,
		titleSize: yaml?.titleSize ?? defaultSettings.titleSize,
		isInCallout: yaml?.isInCallout ?? false,
		useWikilinks: yaml?.useWikilinks ?? defaultSettings.useWikilinks ?? true,
	};
}


export async function updateYamlById(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	overviewId: string,
	file: TFile,
	newYaml: defaultOverviewSettings,
	addLinkList: boolean,
	isCallout = false,
): Promise<void> {
	await plugin.app.vault.process(file, (text) => {
		const yamlBlocks = getYamlBlocks(text, isCallout);
		if (!yamlBlocks) return text;

		for (const block of yamlBlocks) {
			const cleanedBlock = cleanYamlBlock(block, isCallout);
			const yaml = parseYaml(cleanedBlock);
			if (!yaml) continue;

			if (yaml.id === overviewId) {
				let stringYaml = stringifyYaml(newYaml);
				if (stringYaml[stringYaml.length - 1] !== '\n') {
					stringYaml += '\n';
				}

				let newBlock = buildNewBlock(stringYaml, isCallout);

				if (addLinkList && !isCallout) {
					newBlock += buildLinkListBlock(newYaml.id, false);
				} else if (addLinkList && isCallout) {
					newBlock += buildLinkListBlock(newYaml.id, true);
				}

				text = text.replace(block, newBlock);
			}
		}
		return text;
	});

	function getYamlBlocks(text: string, callout: boolean): RegExpMatchArray | null {
		return callout
			? text.match(/^> ```folder-overview\n([\s\S]*?)```/gm)
			: text.match(
				/^(?!>).*```folder-overview\n(?:^(?!>).*[\r\n]*)*?^```$/gm,
			);
	}

	function cleanYamlBlock(block: string, calloutFlag: boolean): string {
		if (calloutFlag) {
			let cleaned = block.replace('> ```folder-overview\n', '').replace('```', '');
			return cleaned.replace(/^> ?/gm, '');
		}
		return block.replace('```folder-overview\n', '').replace('```', '');
	}

	function buildNewBlock(stringYaml: string, calloutFlag: boolean): string {
		if (calloutFlag) {
			const yamlLines = stringYaml
				.split('\n')
				.map((line) => `> ${line}`)
				.join('\n');
			return (
				'> ```folder-overview\n' +
				yamlLines +
				'\n> ```'
			);
		}
		return '```folder-overview\n' + stringYaml + '\n```';
	}
}


export function parseOverviewTitle(
	overview: defaultOverviewSettings,
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	sourceFolder: TFolder | null,
	sourceFolderPath: string,
	sourceFile: TFile,
): string {
	let { title } = overview;
	const variables = {
		folderName: sourceFolder?.path === '/' || sourceFolderPath === '/'
			? 'Vault'
			: sourceFolder?.name ?? '',
		folderPath: sourceFolder?.path ?? sourceFolderPath ?? '',
		filePath: sourceFile.path,
		fileName: sourceFile instanceof TFile ? sourceFile.basename : '',
	};

	const fileCache = plugin.app.metadataCache.getFileCache(sourceFile);
	const frontmatter = fileCache?.frontmatter ?? {};
	title = replacePropertiesInTitle(title, frontmatter);
	title = replaceVariablesInTitle(title, variables);

	return title;
}

export function replacePropertiesInTitle(
	title: string,
	frontmatter: Record<string, unknown>,
): string {
	const propertyRegex = /\{\{properties\.([\w-]+)\}\}/g;
	return title.replace(propertyRegex, (_, prop) => {
		const value = frontmatter[prop];
		return value !== undefined ? String(value) : '';
	});
}

export function replaceVariablesInTitle(
	title: string,
	variables: Record<string, string>,
): string {
	return title.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}
