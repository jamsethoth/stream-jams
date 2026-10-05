obs = obslua
local coord, source, last_request, pending, previous = "", nil, "", nil, ""
local function write(name, value)
  local file = assert(io.open(coord .. "/" .. name, "w"))
  file:write(value) file:close()
end
local function escaped(value)
  return value:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n")
end
local function tick()
  if source == nil then return end
  if pending ~= nil then
    local path = obs.obs_frontend_get_last_screenshot()
    if path ~= nil and path ~= "" and path ~= previous then
      write("capture-" .. pending .. ".json", '{"path":"' .. escaped(path) .. '"}')
      pending = nil
    end
  end
  local file = io.open(coord .. "/request.txt", "r")
  if file == nil then return end
  local request = file:read("*a") file:close()
  if request ~= "" and request ~= last_request and pending == nil then
    last_request, pending = request, request
    previous = obs.obs_frontend_get_last_screenshot() or ""
    obs.obs_frontend_take_source_screenshot(source)
  end
end
local function loaded(event)
  if event ~= obs.OBS_FRONTEND_EVENT_FINISHED_LOADING or source ~= nil then return end
  local settings = obs.obs_data_create()
  local file = assert(io.open(coord .. "/url.txt", "r"))
  local url = file:read("*a") file:close()
  obs.obs_data_set_string(settings, "url", url)
  obs.obs_data_set_int(settings, "width", 1920)
  obs.obs_data_set_int(settings, "height", 1080)
  obs.obs_data_set_bool(settings, "is_local_file", false)
  obs.obs_data_set_bool(settings, "shutdown", false)
  obs.obs_data_set_bool(settings, "reroute_audio", true)
  source = obs.obs_source_create("browser_source", "Security fixture browser", settings, nil)
  obs.obs_data_release(settings)
  if source == nil then write("error.txt", "browser_source creation failed") return end
  obs.obs_source_set_muted(source, true)
  obs.obs_source_set_monitoring_type(source, obs.OBS_MONITORING_TYPE_NONE)
  local scene = obs.obs_scene_create("Security fixture scene")
  obs.obs_scene_add(scene, source)
  obs.obs_frontend_set_current_scene(obs.obs_scene_get_source(scene))
  obs.obs_scene_release(scene)
  obs.timer_add(tick, 100)
  write("ready.json", '{"ready":true}')
end
function script_load(settings)
  coord = obs.obs_data_get_string(settings, "coord")
  if type(obs.obs_frontend_take_source_screenshot) ~= "function" or type(obs.obs_frontend_get_last_screenshot) ~= "function" then
    write("error.txt", "OBS build lacks required Lua frontend screenshot bindings") return
  end
  obs.obs_frontend_add_event_callback(loaded)
end
function script_unload()
  obs.timer_remove(tick)
  if source ~= nil then obs.obs_source_release(source) source = nil end
end
