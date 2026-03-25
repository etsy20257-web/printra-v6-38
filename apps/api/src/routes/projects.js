import { Router } from 'express';
import { createProject, deleteProject, duplicateProject, getProject, listProjects, saveProjectStudioState, toPublicProject, updateProject } from '../lib/projects/store.js';

export const projectsRouter = Router();

projectsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listProjects());
  } catch (error) {
    next(error);
  }
});

projectsRouter.get('/:projectId', async (req, res, next) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true, project: toPublicProject(project), studioState: project.studioState ?? null });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post('/', async (req, res, next) => {
  try {
    const project = await createProject(req.body ?? {});
    res.status(201).json({ ok: true, project: toPublicProject(project) });
  } catch (error) {
    next(error);
  }
});

projectsRouter.patch('/:projectId', async (req, res, next) => {
  try {
    const project = await updateProject(req.params.projectId, req.body ?? {});
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true, project: toPublicProject(project) });
  } catch (error) {
    next(error);
  }
});

projectsRouter.delete('/:projectId', async (req, res, next) => {
  try {
    const project = await deleteProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true, project: toPublicProject(project) });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post('/:projectId/studio-state', async (req, res, next) => {
  try {
    const studioState = req.body?.studioState;
    if (!studioState || typeof studioState !== 'object') {
      res.status(400).json({ error: 'studioState payload is required' });
      return;
    }
    const project = await saveProjectStudioState(req.params.projectId, studioState);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true, project: toPublicProject(project) });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post('/:projectId/duplicate', async (req, res, next) => {
  try {
    const project = await duplicateProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(201).json({ ok: true, project: toPublicProject(project) });
  } catch (error) {
    next(error);
  }
});
