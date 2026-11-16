import 'dotenv/config';
import userModel from '../models/user.model.js';
import categoryModel from '../models/category.model.js';
import categorySchema from '../schemas/category.schema.js';
import z from 'zod';

const create = async (userLogin: string, title: string, description: string | undefined, color: string) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");
    
        await categoryModel.create({
            title,
            description,
            color,
            group: {
                connect: {
                    id: userData.group.id
                }
            }
        });
    } catch (error) {
        console.error("[createCategory]: ", error);
        throw error;
    }
}

const getByCurrentGroupId = async (userLogin: string) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");
    
        return await categoryModel.getByGroupId(userData.group.id);
    } catch (error) {
        console.error("[getCategoryByCurrentGroupId]: ", error);
        throw error;
    }
}

async function getGroupId(userLogin: string) {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");
    if (!userData.group?.id) throw Error("User group not found!");

    return userData.group.id;
}

// Returns null when the category does not belong to the user's group.
const update = async (userLogin: string, data: z.infer<typeof categorySchema.update>) => {
    const currentItem = await categoryModel.getByIdInGroup(data.id, await getGroupId(userLogin));
    if (!currentItem) return null;

    // `??` (not `||`): only a field that was NOT sent keeps its current value.
    // So an empty description clears it. Empty title and invalid color are rejected by the Zod schema.
    const toUpdate = {
        id: currentItem.id,
        title: data.title ?? currentItem.title,
        description: data.description ?? currentItem.description,
        color: data.color ?? currentItem.color,
        group: { connect: { id: currentItem.group.id } },
    };
    
    return await categoryModel.update(data.id, toUpdate);
}

// Returns false when nothing was deleted (not found, or belongs to another group).
const remove = async (userLogin: string, data: z.infer<typeof categorySchema.remove>) => {
    const deletedCount = await categoryModel.remove(data.id, await getGroupId(userLogin));

    return deletedCount > 0;
}

export default { create, getByCurrentGroupId, update, remove };