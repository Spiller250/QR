import { loadConfig } from '../config';
import { openDatabase } from '../db';
import { Store } from '../store';
import { resetDemoData } from './resetData';

const config = loadConfig();
const db = openDatabase(config.databasePath);
resetDemoData(new Store(db), config);
db.close();
console.log(`[veriq] Demo data reset in ${config.databasePath}`);
