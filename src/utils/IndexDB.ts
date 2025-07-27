import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
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

	init(showNotice: boolean) {
		this.active = true;
		const openRequest = indexedDB.open(this.name, this.version);

		openRequest.onupgradeneeded = (event) => {
			const target = event.target as IDBOpenDBRequest | null;
			if (!target) return;
			const db = target.result;
			if (!db.objectStoreNames.contains(this.storeName)) {
				db.createObjectStore(this.storeName, { keyPath: this.keyPath });
			}
			this.indexDB = db;
			this.indexFiles(showNotice);
		};

		openRequest.onsuccess = (event) => {
			const target = event.target as IDBOpenDBRequest | null;
			if (!target) return;
			this.indexDB = target.result;
			openRequest.onblocked = (event) => {
				console.warn('IndexedDB is blocked:', event);
			};
			this.indexDB.onclose = () => {
				this.indexDB = null;
			};
			this.resetDatabase();
			this.indexFiles(showNotice);
		};

		openRequest.onerror = (event) => {
			const target = event.target as IDBOpenDBRequest | null;
			const error = target?.error;
			if (error && error.name === 'VersionError') {
				const deleteRequest = indexedDB.deleteDatabase(this.name);
				deleteRequest.onsuccess = () => {
					this.init(showNotice);
				};
			}
		};
	}

	async indexFiles(showNotice: boolean) {
		if (showNotice) new Notice('Indexing files for folder overview plugin...');
		const files = this.plugin.app.vault.getMarkdownFiles();
		for (const file of files) {
			if (!await hasOverviewYaml(this.plugin, file)) continue;
			this.addNote(file);
		}
		if (showNotice) new Notice('Indexed files for folder overview plugin.');
	}

	addNote(note: TFile) {
		if (!this.active || !this.indexDB) return;
		const transaction = this.indexDB.transaction([this.storeName], 'readwrite');
		const store = transaction.objectStore(this.storeName);
		store.put({ sourcePath: note.path });
	}

	removeNote(notePath: string) {
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

			request.onsuccess = (event) => {
				const target = event.target as IDBRequest | null;
				resolve(target?.result ?? null);
			};

			request.onerror = (event) => {
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

			request.onsuccess = (event) => {
				const target = event.target as IDBRequest | null;
				const result = target?.result ?? [];
				resolve(result.map((data: { sourcePath: string }) => data.sourcePath));
			};

			request.onerror = (event) => {
				reject(event);
			};
		});
	}

	resetDatabase() {
		if (!this.indexDB) return;
		const transaction = this.indexDB.transaction([this.storeName], 'readwrite');
		const store = transaction.objectStore(this.storeName);
		store.clear();
	}
}
