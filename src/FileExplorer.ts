import { MarkdownPostProcessorContext, parseYaml, TAbstractFile, TFolder, TFile, stringifyYaml, Notice, Menu, setIcon, addIcon } from 'obsidian';
import { getFolderNote } from '../../functions/folderNoteFunctions';
import { FolderOverviewSettings } from './modals/Settings';
import { getExcludedFolder } from '../../ExcludeFolders/functions/folderFunctions';
import { getFolderPathFromString } from '../../functions/utils';
import { getEl } from '../../functions/styleFunctions';
import { FolderOverview, overviewSettings } from './FolderOverview';
import FolderNameModal from '../../modals/FolderName';
import NewFolderNameModal from '../../modals/NewFolderName';
import FolderOverviewPlugin from './main';
import FolderNotesPlugin from '../../main';
import { DragManager } from 'obsidian-typings';

export class FileExplorerOverview {
    plugin: FolderOverviewPlugin | FolderNotesPlugin;
    folderOverview: FolderOverview;
    pathBlacklist: string[];
    source: string;
    yaml: overviewSettings;
    root: HTMLElement;

    eventListeners: (() => void)[] = [];
    constructor(plugin: FolderOverviewPlugin | FolderNotesPlugin, ctx: MarkdownPostProcessorContext, root: HTMLElement, yaml: overviewSettings, pathBlacklist: string[], folderOverview: FolderOverview) {
        this.plugin = plugin;
        this.folderOverview = folderOverview;
        this.pathBlacklist = pathBlacklist;
        this.source = ctx.sourcePath;
        this.yaml = yaml;
        this.root = root;
    }

    disconnectListeners() {
        this.eventListeners.forEach((unregister) => {
            unregister();
        });
        this.eventListeners = [];
    }

    async renderFileExplorer() {
        this.disconnectListeners();
        const plugin = this.plugin;
        const ctx = this.folderOverview.ctx;
        const root = this.folderOverview.root;
        const yaml = this.folderOverview.yaml;
        const folderOverview = this.folderOverview;
        let folder: HTMLElement | null = null;
        if (plugin instanceof FolderNotesPlugin) {
            folder = getEl(yaml.folderPath, plugin);
        }
        let folderElement = folder?.parentElement;
        const source = ctx.sourcePath;
        const overviewList = folderOverview.listEl;
        overviewList?.empty();
        if (!overviewList) return;

        let tFolder = plugin.app.vault.getAbstractFileByPath(yaml.folderPath);
        if (!tFolder && yaml.folderPath.trim() == '') {
            if (ctx.sourcePath.includes('/')) {
                tFolder = plugin.app.vault.getAbstractFileByPath(getFolderPathFromString(ctx.sourcePath));
            } else {
                yaml.folderPath = '/';
                tFolder = plugin.app.vault.getAbstractFileByPath('/');
            }
        }

        if (!folderElement && !tFolder) return;
        // wait until the file explorer is loaded

        const sourceFolderPath = tFolder?.path || '';

        folderElement = document.querySelectorAll('.nav-files-container')[0] as HTMLElement;
        if (!folderElement) {
            folderElement = root.createDiv({
                cls: 'nav-files-container',
            });
        }

        const newFolderElement = folderElement.cloneNode(true) as HTMLElement;

        newFolderElement.querySelectorAll('div.nav-folder-title').forEach((el) => {
            const folder = plugin.app.vault.getAbstractFileByPath(el.getAttribute('data-path') || '');
            if (!(folder instanceof TFolder)) return;

            if (yaml.alwaysCollapse) {
                folder.collapsed = true;
                el.classList.add('is-collapsed');
            } else {
                if (yaml.storeFolderCondition) {
                    if (folder.collapsed) {
                        el.classList.add('is-collapsed');
                    } else {
                        el.classList.remove('is-collapsed');
                    }
                } else {
                    if (el.parentElement?.classList.contains('is-collapsed')) {
                        folder.collapsed = true;
                    } else {
                        folder.collapsed = false;
                    }
                }
            }

            if (el.classList.contains('has-folder-note')) {
                if (plugin instanceof FolderNotesPlugin) {
                    const folderNote = getFolderNote(plugin, folder.path);
                    if (folderNote) { folderOverview.pathBlacklist.push(folderNote.path); }
                }
            }
        });

        const debouncedRenderFileExplorer = this.debounce(() => this.renderFileExplorer(), 300);

        const handleVaultChange = () => {
            debouncedRenderFileExplorer();
        }

        this.eventListeners.push(() => {
            folderOverview.off('vault-change', handleVaultChange);
        });

        folderOverview.on('vault-change', handleVaultChange);

        if (tFolder instanceof TFolder) {
            await this.addFiles(tFolder.children, overviewList, folderOverview, sourceFolderPath);
        }

        newFolderElement.querySelectorAll('div.tree-item-icon').forEach((el) => {
            if (el instanceof HTMLElement) {
                el.onclick = () => {
                    const path = el.parentElement?.getAttribute('data-path');
                    if (!path) return;
                    const folder = plugin.app.vault.getAbstractFileByPath(path);
                    this.handleCollapseClick(el, plugin, yaml, this.pathBlacklist, sourceFolderPath, folderOverview, folder);
                }
            }
        });
    }

    debounce(func: Function, wait: number) {
        let timeout: number | undefined;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = window.setTimeout(() => func.apply(this, args), wait);
        };
    }

    async addFiles(files: TAbstractFile[], childrenElement: HTMLElement, folderOverview: FolderOverview, sourceFolderPath: string) {
        const plugin = folderOverview.plugin;
        const allFiles = await folderOverview.filterFiles(files, plugin, sourceFolderPath, folderOverview.yaml.depth, folderOverview.pathBlacklist);
        const sortedFiles = folderOverview.sortFiles((allFiles ?? []).filter((file): file is TAbstractFile => file !== null));

        const folders = sortedFiles.filter(child => child instanceof TFolder);
        const otherFiles = sortedFiles.filter(child => child instanceof TFile);

        for (const child of folders) {
            if (!(child instanceof TFolder)) continue;
            await this.createFolderEL(plugin, child, folderOverview, childrenElement, sourceFolderPath);
        }

        for (const child of otherFiles) {
            if (!(child instanceof TFile)) continue;
            await this.createFileEL(plugin, child, folderOverview, childrenElement);
        }

    }

    async handleCollapseClick(el: HTMLElement, plugin: FolderOverviewPlugin | FolderNotesPlugin, yaml: overviewSettings, pathBlacklist: string[], sourceFolderPath: string, folderOverview: FolderOverview, folder?: TFolder | undefined | null | TAbstractFile) {
        el.classList.toggle('is-collapsed');
        if (el.classList.contains('is-collapsed')) {
            if (!(folder instanceof TFolder)) return;
            folder.collapsed = true;
            el.parentElement?.parentElement?.childNodes[1]?.remove();
        } else {
            if (!(folder instanceof TFolder)) return;
            folder.collapsed = false;
            const folderElement = el.parentElement?.parentElement;
            if (!folderElement) return;
            const childrenElement = folderElement.createDiv({ cls: 'tree-item-children nav-folder-children' });
            let files = folderOverview.sortFiles(folder.children);
            const filteredFiles = (await folderOverview.filterFiles(files, plugin, folder.path, yaml.depth || 1, pathBlacklist) ?? []).filter((file): file is TAbstractFile => file !== null);
            await this.addFiles(filteredFiles, childrenElement, folderOverview, sourceFolderPath);
        }
    }

    async createFolderEL(plugin: FolderOverviewPlugin | FolderNotesPlugin, child: TFolder, folderOverview: FolderOverview, childrenElement: HTMLElement, sourceFolderPath: string) {
        const pathBlacklist = folderOverview.pathBlacklist;
        const source = folderOverview.source;
        let folderNote: TFile | null | undefined = undefined;
        if (plugin instanceof FolderNotesPlugin) {
            folderNote = getFolderNote(plugin, child.path);
        }
        const yaml = folderOverview.yaml;
        let folderTitle: HTMLElement | null = null;
        let folderElement: HTMLElement | null = null;

        if (folderNote) { pathBlacklist.push(folderNote.path); }
        let excludedFolder = undefined;
        if (plugin instanceof FolderNotesPlugin) {
            excludedFolder = await getExcludedFolder(plugin, child.path, true);
        }
        if (excludedFolder?.excludeFromFolderOverview) { return; }

        if (yaml.includeTypes.includes('folder')) {
            folderElement = childrenElement.createDiv({
                cls: 'tree-item nav-folder',
            });
            folderTitle = folderElement.createDiv({
                cls: 'tree-item-self is-clickable nav-folder-title',
                attr: {
                    'data-path': child.path,
                    'draggable': 'true'
                },
            })

            const folderTitleText = folderTitle?.createDiv({
                cls: 'tree-item-inner nav-folder-title-content',
                text: child.name,
            });

            if (folderTitleText && !folderNote) {
                folderTitleText.onclick = () => {
                    const collapseIcon = folderTitle?.querySelectorAll('.tree-item-icon')[0] as HTMLElement;
                    if (collapseIcon) {
                        this.handleCollapseClick(collapseIcon, plugin, yaml, pathBlacklist, sourceFolderPath, folderOverview, child);
                    }
                }
            }

            folderTitle.draggable = true;
            folderTitle.addEventListener('dragstart', e => {
                const dragManager = plugin.app.dragManager;
                const dragData = dragManager.dragFolder(e, child);
                dragManager.onDragStart(e, dragData);
                folderTitle?.classList.add('is-being-dragged');
            });

            folderTitle.addEventListener('dragend', e => {
                folderTitle?.classList.remove('is-being-dragged');
            });

            folderTitle.addEventListener('dragover', e => {
                e.preventDefault();
                const { draggable } = plugin.app.dragManager;
                if (draggable && draggable.file instanceof TFolder) {
                    folderElement?.classList.add('is-being-dragged-over');
                    plugin.app.dragManager.setAction(window.i18next.t('interface.drag-and-drop.move-into-folder', { folder: child.name }));
                }
            });

            folderTitle.addEventListener('dragleave', e => {
                folderElement?.classList.remove('is-being-dragged-over');
            });

            // handle the drop event
            folderTitle.addEventListener('drop', e => {
                const { draggable } = plugin.app.dragManager;
                if (draggable && draggable.file instanceof TFolder) {
                    plugin.app.fileManager.renameFile(draggable.file, child.path + '/' + draggable.file.name);
                }
            });

            folderTitle.oncontextmenu = (e) => {
                folderOverview.folderMenu(child, e);
            }
        }

        if (!child.collapsed) {
            if (yaml.alwaysCollapse) {
                child.collapsed = true;
            }
            if (yaml.includeTypes.includes('folder')) {
                folderTitle?.classList.remove('is-collapsed');
                const childrenElement = folderElement?.createDiv({ cls: 'tree-item-children nav-folder-children' });
                if (childrenElement) {
                    await this.addFiles(child.children, childrenElement, folderOverview, sourceFolderPath);
                }
            } else {
                await this.addFiles(child.children, childrenElement, folderOverview, sourceFolderPath);
            }
        } else {
            folderTitle?.classList.add('is-collapsed');
        }

        if (folderNote) { folderTitle?.classList.add('has-folder-note') }
        if (folderNote && child.children.length === 1 && yaml.disableCollapseIcon) { folderTitle?.classList.add('fn-has-no-files') }

        const collapseIcon = folderTitle?.createDiv({
            cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator fn-folder-overview-collapse-icon',
        });

        if (child.collapsed) {
            collapseIcon?.classList.add('is-collapsed');
        }

        if (collapseIcon) {
            setIcon(collapseIcon, 'chevron-down');
            collapseIcon.querySelector('path')?.setAttribute('d', 'M3 8L12 17L21 8');
            collapseIcon.onclick = () => {
                this.handleCollapseClick(collapseIcon, plugin, yaml, pathBlacklist, sourceFolderPath, folderOverview, child);
            }
        }
    }

    async createFileEL(plugin: FolderOverviewPlugin | FolderNotesPlugin, child: TFile, folderOverview: FolderOverview, childrenElement: HTMLElement) {
        const yaml = folderOverview.yaml;
        const pathBlacklist = folderOverview.pathBlacklist;

        if (pathBlacklist.includes(child.path) && !yaml.showFolderNotes) { return; }
        const extension = child.extension.toLowerCase() == 'md' ? 'markdown' : child.extension.toLowerCase();
        const includeTypes = yaml.includeTypes;

        if (includeTypes.length > 0 && !includeTypes.includes('all')) {
            if ((extension === 'md' || extension === 'markdown') && !includeTypes.includes('markdown')) return;
            if (extension === 'canvas' && !includeTypes.includes('canvas')) return;
            if (extension === 'pdf' && !includeTypes.includes('pdf')) return;
            const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
            if (imageTypes.includes(extension) && !includeTypes.includes('image')) return;
            const videoTypes = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
            if (videoTypes.includes(extension) && !includeTypes.includes('video')) return;
            const audioTypes = ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus'];
            if (audioTypes.includes(extension) && includeTypes.includes('audio')) return;
            const allTypes = ['markdown', 'md', 'canvas', 'pdf', ...imageTypes, ...videoTypes, ...audioTypes];
            if (!allTypes.includes(extension) && !includeTypes.includes('other')) return;
        }

        const fileElement = childrenElement.createDiv({
            cls: 'tree-item nav-file',
        });

        const fileTitle = fileElement.createDiv({
            cls: 'tree-item-self is-clickable nav-file-title pointer-cursor',
            attr: {
                'data-path': child.path,
                'draggable': 'true'
            },
        })

        fileTitle.addEventListener('dragover', e => {
            e.preventDefault();
            const { draggable } = plugin.app.dragManager;
            if (draggable && draggable.file instanceof TFolder) {
                plugin.app.dragManager.setAction(window.i18next.t('interface.drag-and-drop.move-into-folder', { folder: child.parent?.name || '' }));
                const folderEL = folderOverview.getElFromOverview(child.parent?.path || '')
                if (folderEL) {
                    folderEL.parentElement?.classList.add('is-being-dragged-over');
                }
            }
        });

        fileTitle.addEventListener('dragleave', e => {
            const folderEL = folderOverview.getElFromOverview(child.parent?.path || '')
            if (folderEL) {
                folderEL.parentElement?.classList.remove('is-being-dragged-over');
            }
        });

        fileTitle.addEventListener('drop', e => {
            const { draggable } = plugin.app.dragManager;
            if (draggable && draggable.file instanceof TFolder) {
                plugin.app.fileManager.renameFile(draggable.file, child.parent?.path + '/' + draggable.file.name);
            }
        });

        fileTitle.onclick = () => {
            plugin.app.workspace.openLinkText(child.path, child.path, true);
        }

        fileTitle.oncontextmenu = (e) => {
            folderOverview.fileMenu(child, e);
        }

        fileTitle.createDiv({
            cls: 'tree-item-inner nav-file-title-content',
            text: child.basename,
        });

        if (child.extension !== 'md' && !yaml.disableFileTag) {
            fileTitle.createDiv({
                cls: 'nav-file-tag',
                text: child.extension
            });
        }
    }
}