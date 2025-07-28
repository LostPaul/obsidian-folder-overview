import { type TFile, Notice } from 'obsidian';
import type FolderOverviewPlugin from '../main';
import type FolderNotesPlugin from '../../../main';
import { hasOverviewYaml } from '../FolderOverview';

export class FvIndexDB {
	name = 'fn-folder-overview';
	version = 1;
	storeName = 'files';
	keyPath = 'sourcePath';
	active = false;
	private indexDB: IDBDatabase | null = null;
	plugin: FolderOverviewPlugin | FolderNotesPlugin;

	constructor(plugin: FolderOverviewPlugin | FolderNotesPlugin) {
		this.plugin = plugin;
	}

	init(showNotice: boolean): void {
		this.active = true;
		const openRequest = indexedDB.open(this.name, this.version);

		openRequest.onupgradeneeded = (event): void => {
			const target = event.target as IDBOpenDBRequest | null;
			if (!target) return;
			const db = target.result;
			if (!db.objectStoreNames.contains(this.storeName)) {
				db.createObjectStore(this.storeName, { keyPath: this.keyPath });
			}
			this.indexDB = db;
			this.indexFiles(showNotice);
		};

		openRequest.onsuccess = (event): void => {
			const target = event.target as IDBOpenDBRequest | null;
			if (!target) return;
			this.indexDB = target.result;
			openRequest.onblocked = (blockedEvent): void => {
				console.warn('IndexedDB is blocked:', blockedEvent);
			};
			this.indexDB.onclose = (): void => {
				this.indexDB = null;
			};
			this.resetDatabase();
			this.indexFiles(showNotice);
		};

		openRequest.onerror = (event): void => {
			const target = event.target as IDBOpenDBRequest | null;
			const error = target?.error;
			if (error && error.name === 'VersionError') {
				const deleteRequest = indexedDB.deleteDatabase(this.name);
				deleteRequest.onsuccess = (): void => {
					this.init(showNotice);
				};
			}
		};
	}

	async indexFiles(showNotice: boolean): Promise<void> {
		if (showNotice) new Notice('Indexing files for folder overview plugin...');
		const files = this.plugin.app.vault.getMarkdownFiles();
		for (const file of files) {
			if (!await hasOverviewYaml(this.plugin, file)) continue;
			this.addNote(file);
		}
		if (showNotice) new Notice('Indexed files for folder overview plugin.');
	}

	addNote(note: TFile): void {
		if (!this.active || !this.indexDB) return;
		const transaction = this.indexDB.transaction([this.storeName], 'readwrite');
		const store = transaction.objectStore(this.storeName);
		store.put({ sourcePath: note.path });
	}

	removeNote(notePath: string): void {
		if (!this.active || !this.indexDB) return;
		const transaction = this.indexDB.transaction([this.storeName], 'readwrite');
		const store = transaction.objectStore(this.storeName);
		store.delete(notePath);
	}

	getNote(path: string): Promise<string | null> {
		if (!this.active) return Promise.resolve(null);
		return new Promise((resolve, reject) => {
			if (!this.indexDB) return resolve(null);
			const transaction = this.indexDB.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.get(path);

			request.onsuccess = (event): void => {
				const target = event.target as IDBRequest | null;
				resolve(target?.result ?? null);
			};

			request.onerror = (event): void => {
				reject(event);
			};
		});
	}

	getAllNotes(): Promise<string[]> {
		if (!this.active) return Promise.resolve([]);
		return new Promise((resolve, reject) => {
			if (!this.indexDB) return resolve([]);
			const transaction = this.indexDB.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.getAll();

			request.onsuccess = (event): void => {
				const target = event.target as IDBRequest | null;
				const result = target?.result ?? [];
				resolve(result.map((data: { sourcePath: string }) => data.sourcePath));
			};

			request.onerror = (event): void => {
				reject(event);
			};
		});
	}

	resetDatabase(): void {
		if (!this.indexDB) return;
		const transaction = this.indexDB.transaction([this.storeName], 'readwrite');
		const store = transaction.objectStore(this.storeName);
		store.clear();
	}
}
