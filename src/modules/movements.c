/* Stellarium Web Engine - Copyright (c) 2022 - Stellarium Labs SRL
 *
 * This program is licensed under the terms of the GNU AGPL v3, or
 * alternatively under a commercial licence.
 *
 * The terms of the AGPL v3 license can be found in the main directory of this
 * repository.
 */

/*
 * Module that handles the movements from mouse and keyboard inputs
 * Should this be renamed to navigation?
 */

#include "swe.h"

typedef struct movements {
    obj_t           obj;
    gesture_t       gest_pan;
    gesture_t       gest_click;
    gesture_t       gest_pinch;
} movements_t;


// Convert screen position to mount coordinates.
static void screen_to_mount(
        const observer_t *obs, const projection_t *proj,
        const double screen_pos[2], double p[3])
{
    double pos[4] = {screen_pos[0], screen_pos[1]};
    unproject(proj, pos, pos);
    vec3_normalize(pos, pos);
    convert_frame(obs, FRAME_VIEW, FRAME_MOUNT, true, pos, p);
}


static int on_pan(const gesture_t *gest, void *user)
{
    double sal, saz, dal, daz;
    double pos[3];
    static double start_pos[3];
    projection_t proj;
    double delta_yaw, delta_pitch;
    double current_time = core->clock;
    double dt;
    double sensitivity = core->touch_settings.pan_sensitivity;

    core_get_proj(&proj);
    screen_to_mount(core->observer, &proj, gest->pos, pos);

    if (gest->state == GESTURE_BEGIN) {
        vec3_copy(pos, start_pos);
        // Reset pan inertia on gesture begin
        core->pan_inertia.velocity[0] = 0.0;
        core->pan_inertia.velocity[1] = 0.0;
        core->pan_inertia.last_time = current_time;
    }

    vec3_to_sphe(start_pos, &saz, &sal);
    vec3_to_sphe(pos, &daz, &dal);

    // Apply touch sensitivity
    delta_yaw = (saz - daz) * sensitivity;
    delta_pitch = (sal - dal) * sensitivity;

    core->observer->yaw += delta_yaw;
    core->observer->pitch += delta_pitch;
    core->observer->pitch = clamp(core->observer->pitch, -M_PI / 2, +M_PI / 2);

    // Calculate pan velocity for inertia
    if (core->pan_inertia.enabled && gest->state == GESTURE_UPDATE) {
        dt = current_time - core->pan_inertia.last_time;
        if (dt > 0.0001) {  // Avoid division by zero
            core->pan_inertia.velocity[0] = delta_yaw / dt;
            core->pan_inertia.velocity[1] = delta_pitch / dt;
        }
        core->pan_inertia.last_time = current_time;
    }

    // Clear velocity on gesture end if inertia is disabled
    if (gest->state == GESTURE_END && !core->pan_inertia.enabled) {
        core->pan_inertia.velocity[0] = 0.0;
        core->pan_inertia.velocity[1] = 0.0;
    }

    obj_set_attr(&core->obj, "lock", NULL);
    observer_update(core->observer, true);
    // Notify the changes.
    module_changed(&core->observer->obj, "pitch");
    module_changed(&core->observer->obj, "yaw");
    return 0;
}

static int on_click(const gesture_t *gest, void *user)
{
    obj_t *obj;
    bool r = false;
    if (core->on_click)
        r = core->on_click(gest->pos[0], gest->pos[1]);
    // Default behavior: select an object.
    if (!r) {
        obj = core_get_obj_at(gest->pos[0], gest->pos[1], 18);
        obj_set_attr(&core->obj, "selection", obj);
        obj_release(obj);
    }
    core->clicks++;
    module_changed((obj_t*)core, "clicks");
    return 0;
}

static int on_pinch(const gesture_t *gest, void *user)
{
    static double start_fov = 0;
    double current_time = core->clock;
    double dt;

    if (gest->state == GESTURE_BEGIN) {
        start_fov = core->fov;
        core->pinch_inertia.velocity = 0.0;
        core->pinch_inertia.last_scale = 1.0;
        core->pinch_inertia.last_time = current_time;
        core->pinch_inertia.center[0] = gest->pos[0];
        core->pinch_inertia.center[1] = gest->pos[1];
    }

    // Calculate zoom velocity for inertia
    if (core->pinch_inertia.enabled && gest->state == GESTURE_UPDATE) {
        dt = current_time - core->pinch_inertia.last_time;
        if (dt > 0.0001) {  // Avoid division by zero
            double scale_change = gest->pinch / core->pinch_inertia.last_scale;
            core->pinch_inertia.velocity = (scale_change - 1.0) / dt;
        }
        core->pinch_inertia.last_scale = gest->pinch;
        core->pinch_inertia.last_time = current_time;
        core->pinch_inertia.center[0] = gest->pos[0];
        core->pinch_inertia.center[1] = gest->pos[1];
    }

    core->fov = start_fov / gest->pinch;
    module_changed((obj_t*)core, "fov");
    return 0;
}

static int movements_init(obj_t *obj, json_value *args)
{
    movements_t *movs = (void*)obj;
    movs->gest_pan = (gesture_t) {
        .type = GESTURE_PAN,
        .callback = on_pan,
    };
    movs->gest_click = (gesture_t) {
        .type = GESTURE_CLICK,
        .callback = on_click,
    };
    movs->gest_pinch = (gesture_t) {
        .type = GESTURE_PINCH,
        .callback = on_pinch,
    };
    return 0;
}

static int get_touch_index(int id)
{
    int i;
    assert(id != 0);
    for (i = 0; i < ARRAY_SIZE(core->inputs.touches); i++) {
        if (core->inputs.touches[i].id == id) return i;
    }
    // Create new touch.
    for (i = 0; i < ARRAY_SIZE(core->inputs.touches); i++) {
        if (!core->inputs.touches[i].id) {
            core->inputs.touches[i].id = id;
            return i;
        }
    }
    return -1; // No more space.
}

static int movements_on_mouse(obj_t *obj, int id, int state,
                              double x, double y, int buttons)
{
    movements_t *movs = (void*)obj;
    if (buttons != 1) return 0;
    id = get_touch_index(id + 1);
    if (id == -1) return 0;
    if (state == -1) state = core->inputs.touches[id].down[0];
    if (state == 0) core->inputs.touches[id].id = 0; // Remove.
    core->inputs.touches[id].pos[0] = x;
    core->inputs.touches[id].pos[1] = y;
    core->inputs.touches[id].down[0] = state == 1;
    if (core->gui_want_capture_mouse) return 0;
    gesture_t *gs[] = {&movs->gest_pan, &movs->gest_pinch, &movs->gest_click};
    gesture_on_mouse(3, gs, id, state, x, y, movs);
    return 0;
}

static int movements_on_zoom(obj_t *obj, double k, double x, double y)
{
    double fov, pos_start[3], pos_end[3];
    double sal, saz, dal, daz;
    projection_t proj;

    core_get_proj(&proj);
    screen_to_mount(core->observer, &proj, VEC(x, y), pos_start);
    obj_get_attr(&core->obj, "fov", &fov);
    fov /= k;
    fov = clamp(fov, CORE_MIN_FOV, proj.klass->max_ui_fov);
    obj_set_attr(&core->obj, "fov", fov);
    core_get_proj(&proj);
    screen_to_mount(core->observer, &proj, VEC(x, y), pos_end);

    // Adjust lat/az to keep the mouse point at the same position.
    vec3_to_sphe(pos_start, &saz, &sal);
    vec3_to_sphe(pos_end, &daz, &dal);
    core->observer->yaw += (saz - daz);
    core->observer->pitch += (sal - dal);
    core->observer->pitch = clamp(core->observer->pitch, -M_PI / 2, +M_PI / 2);

    // Notify the changes.
    module_changed(&core->observer->obj, "pitch");
    module_changed(&core->observer->obj, "yaw");
    return 0;
}

static int movements_update(obj_t *obj, double dt)
{
    const double ZOOM_FACTOR = 1.05;
    const double MOVE_SPEED  = 1 * DD2R;
    const double INERTIA_MIN_VELOCITY = 0.001;  // Minimum velocity threshold
    projection_t proj;

    if (core->inputs.keys[KEY_RIGHT])
        core->observer->yaw += MOVE_SPEED * core->fov;
    if (core->inputs.keys[KEY_LEFT])
        core->observer->yaw -= MOVE_SPEED * core->fov;
    if (core->inputs.keys[KEY_UP])
        core->observer->pitch += MOVE_SPEED * core->fov;
    if (core->inputs.keys[KEY_DOWN])
        core->observer->pitch -= MOVE_SPEED * core->fov;
    if (core->inputs.keys[KEY_PAGE_UP])
        core->fov /= ZOOM_FACTOR;
    if (core->inputs.keys[KEY_PAGE_DOWN])
        core->fov *= ZOOM_FACTOR;

    // Apply pinch zoom inertia for smooth mobile experience
    if (core->pinch_inertia.enabled &&
        fabs(core->pinch_inertia.velocity) > INERTIA_MIN_VELOCITY) {
        // Apply velocity to fov
        double scale_factor = 1.0 + core->pinch_inertia.velocity * dt;
        if (scale_factor > 0.5 && scale_factor < 2.0) {  // Safety bounds
            core->fov /= scale_factor;
            // Clamp FOV to valid range
            core_get_proj(&proj);
            core->fov = clamp(core->fov, CORE_MIN_FOV, proj.klass->max_ui_fov);
            module_changed((obj_t*)core, "fov");
        }

        // Apply friction to velocity
        core->pinch_inertia.velocity *= core->pinch_inertia.friction;

        // Stop when velocity is very small
        if (fabs(core->pinch_inertia.velocity) <= INERTIA_MIN_VELOCITY) {
            core->pinch_inertia.velocity = 0.0;
        }
    }

    // Apply pan inertia for smooth mobile panning
    if (core->pan_inertia.enabled &&
        (fabs(core->pan_inertia.velocity[0]) > INERTIA_MIN_VELOCITY ||
         fabs(core->pan_inertia.velocity[1]) > INERTIA_MIN_VELOCITY)) {

        // Apply velocity to yaw and pitch
        core->observer->yaw += core->pan_inertia.velocity[0] * dt;
        core->observer->pitch += core->pan_inertia.velocity[1] * dt;
        core->observer->pitch = clamp(core->observer->pitch, -M_PI / 2, +M_PI / 2);

        // Apply friction to velocity
        core->pan_inertia.velocity[0] *= core->pan_inertia.friction;
        core->pan_inertia.velocity[1] *= core->pan_inertia.friction;

        // Stop when velocity is very small
        if (fabs(core->pan_inertia.velocity[0]) <= INERTIA_MIN_VELOCITY)
            core->pan_inertia.velocity[0] = 0.0;
        if (fabs(core->pan_inertia.velocity[1]) <= INERTIA_MIN_VELOCITY)
            core->pan_inertia.velocity[1] = 0.0;

        // Notify changes
        module_changed(&core->observer->obj, "pitch");
        module_changed(&core->observer->obj, "yaw");
    }

    return 0;
}

/*
 * Meta class declarations.
 */
static obj_klass_t movements_klass = {
    .id             = "movements",
    .size           = sizeof(movements_t),
    .flags          = OBJ_IN_JSON_TREE | OBJ_MODULE,
    .init           = movements_init,
    .on_mouse       = movements_on_mouse,
    .on_zoom        = movements_on_zoom,
    .update         = movements_update,
    .render_order   = -1,
};
OBJ_REGISTER(movements_klass);
