/**
 * Background location task (PRD §7.3). Registered at module load — import this
 * file once at app startup so the task exists before startLocationUpdatesAsync
 * runs. expo-location delivers batched fixes here while the foreground service
 * keeps the process alive; we forward them to the duty controller.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { LOCATION_TASK } from '../constants';
import { dutyController } from './dutyController';

interface LocationTaskData {
  locations: Location.LocationObject[];
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as LocationTaskData | undefined)?.locations;
  if (locations?.length) {
    dutyController.onLocations(locations);
  }
});
