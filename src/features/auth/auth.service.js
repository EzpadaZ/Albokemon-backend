import { v4 as uuidv4 } from 'uuid';

export function createUser(name = "Guest") {
    return {
        id: uuidv4(),
        name: String(name).slice(0, 24),
    };
}
