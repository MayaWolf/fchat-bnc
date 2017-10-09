import * as fs from 'fs';
import * as path from 'path';

export function mkdir(dir: string): void {
	try {
		fs.mkdirSync(dir);
	} catch(e) {
		if(!(e instanceof Error)) throw e;
		switch((<Error & {code: string}>e).code) {
			case 'ENOENT':
				mkdir(path.dirname(dir));
				mkdir(dir);
				break;
			default:
				try {
					const stat = fs.statSync(dir);
					if(stat.isDirectory()) return;
				} catch(e) {
					console.error(e);
				}
				throw e;
		}
	}
}