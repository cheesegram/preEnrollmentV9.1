import express from 'express';
import {
	getAllSchedules,
	getScheduleById,
	getScheduleConflicts,
	updateScheduleClasses,
} from '../controllers/masterScheduleController.js';
import { generateSchedule } from '../controllers/scheduleController.js';

const router = express.Router();

router.get('/', getAllSchedules);
router.get('/conflicts', getScheduleConflicts);
router.patch('/:id/classes', updateScheduleClasses);
router.post('/generate', generateSchedule);
router.get('/:id', getScheduleById);

export default router;
