obs = obslua
local coord, source, scene, scene_item = "", nil, nil, nil
local source_id, last_request, pending, previous = "", "", nil, ""
local sources = {}
local matte, capture_delay = nil, 0

local function read(name)
  local file = io.open(coord .. "/" .. name, "r")
  if file == nil then return nil end
  local value = file:read("*a"); file:close(); return value
end

local function write(name, value)
  local file = io.open(coord .. "/" .. name, "w")
  if file ~= nil then file:write(value); file:close() end
end

local function escaped(value)
  return value:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r")
end

local function valid_id(value)
  return value ~= "" and #value <= 100 and value:match("^[A-Za-z0-9%-]+$") ~= nil
end

local function valid_size(width, height)
  return width >= 1 and width <= 4096 and height >= 1 and height <= 4096
end

-- No URL/key enters receipts. The private manifest stays in the owned temp directory.
local function snapshot()
  local entry = sources[source_id]
  local settings = obs.obs_source_get_settings(source)
  local result = string.format('"sourceId":"%s","moduleId":"%s","profile":"%s","nativeWidth":%d,"nativeHeight":%d,"settingsWidth":%d,"settingsHeight":%d,"muted":%s,"monitoring":%d,"shutdown":%s,"rerouteAudio":%s',
    escaped(source_id), escaped(entry.module_id), escaped(entry.profile),
    obs.obs_source_get_width(source), obs.obs_source_get_height(source),
    obs.obs_data_get_int(settings, "width"), obs.obs_data_get_int(settings, "height"),
    tostring(obs.obs_source_muted(source)), obs.obs_source_get_monitoring_type(source),
    tostring(obs.obs_data_get_bool(settings, "shutdown")), tostring(obs.obs_data_get_bool(settings, "reroute_audio")))
  obs.obs_data_release(settings)
  return result
end

local function select_source(id, width, height)
  local entry = sources[id]
  if entry == nil or not valid_size(width, height) then return false end
  if scene_item ~= nil then obs.obs_sceneitem_remove(scene_item); scene_item = nil end
  if source ~= nil then obs.obs_source_release(source); source = nil end
  local settings = obs.obs_data_create()
  obs.obs_data_set_string(settings, "url", entry.url)
  obs.obs_data_set_int(settings, "width", width)
  obs.obs_data_set_int(settings, "height", height)
  obs.obs_data_set_bool(settings, "is_local_file", false)
  obs.obs_data_set_bool(settings, "shutdown", false)
  obs.obs_data_set_bool(settings, "reroute_audio", true)
  source = obs.obs_source_create("browser_source", "Security fixture browser " .. id, settings, nil)
  obs.obs_data_release(settings)
  if source == nil then return false end
  source_id = id
  obs.obs_source_set_muted(source, true)
  obs.obs_source_set_monitoring_type(source, obs.OBS_MONITORING_TYPE_NONE)
  scene_item = obs.obs_scene_add(scene, source)
  return true
end

local function tick()
  if source == nil then return end
  if pending ~= nil then
    if capture_delay > 0 then
      capture_delay = capture_delay - 1
      if capture_delay == 0 then obs.obs_frontend_take_source_screenshot(obs.obs_scene_get_source(scene)) end
      return
    end
    local path = obs.obs_frontend_get_last_screenshot()
    if path ~= nil and path ~= "" and path ~= previous then
      write("capture-" .. pending .. ".json", '{"path":"' .. escaped(path) .. '",' .. snapshot() .. '}')
      pending = nil
    end
    return
  end
  local raw = read("request.json")
  if raw == nil then return end
  local request = obs.obs_data_create_from_json(raw)
  if request == nil then write("error.txt", "Owned OBS coordination JSON is invalid."); return end
  local id = obs.obs_data_get_string(request, "id")
  local op = obs.obs_data_get_string(request, "op")
  local selected = obs.obs_data_get_string(request, "sourceId")
  if id == last_request then obs.obs_data_release(request); return end
  if not valid_id(id) or sources[selected] == nil then
    obs.obs_data_release(request); write("error.txt", "Owned OBS request identity is invalid."); return
  end
  last_request = id
  local width = obs.obs_data_get_int(request, "width")
  local height = obs.obs_data_get_int(request, "height")
  if op == "select" or op == "reconnect" then
    if not select_source(selected, width, height) then write("error.txt", "Could not create owned module browser source.") end
  elseif op == "resize" and selected == source_id and valid_size(width, height) then
    local settings = obs.obs_source_get_settings(source)
    obs.obs_data_set_int(settings, "width", width); obs.obs_data_set_int(settings, "height", height)
    obs.obs_source_update(source, settings); obs.obs_data_release(settings)
  elseif op == "capture" and selected == source_id then
    local settings = obs.obs_source_get_settings(matte)
    obs.obs_data_set_int(settings, "color", obs.obs_data_get_string(request, "matte") == "white" and 4294967295 or 4278190080)
    obs.obs_source_update(matte, settings); obs.obs_data_release(settings)
    pending = id
    previous = obs.obs_frontend_get_last_screenshot() or ""
    capture_delay = 2 -- Render the contrasting matte through native OBS frames before its RGB screenshot.
  else
    write("error.txt", "Owned OBS coordination operation is invalid.")
  end
  obs.obs_data_release(request)
  if source ~= nil and op ~= "capture" then write("command-" .. id .. ".json", '{' .. snapshot() .. '}') end
end

local function loaded(event)
  if event ~= obs.OBS_FRONTEND_EVENT_FINISHED_LOADING or source ~= nil then return end
  local raw = read("sources.json")
  if raw == nil then write("error.txt", "Owned OBS source manifest is missing."); return end
  local data = obs.obs_data_create_from_json(raw)
  if data == nil then write("error.txt", "Owned OBS source manifest is invalid."); return end
  local list = obs.obs_data_get_array(data, "sources")
  for index = 0, obs.obs_data_array_count(list) - 1 do
    local item = obs.obs_data_array_item(list, index)
    local id = obs.obs_data_get_string(item, "id")
    local width = obs.obs_data_get_int(item, "width")
    local height = obs.obs_data_get_int(item, "height")
    if valid_id(id) and valid_size(width, height) then
      sources[id] = { url = obs.obs_data_get_string(item, "url"), width = width, height = height,
        module_id = obs.obs_data_get_string(item, "moduleId"), profile = obs.obs_data_get_string(item, "profile") }
    end
    obs.obs_data_release(item)
  end
  obs.obs_data_array_release(list); obs.obs_data_release(data)
  if sources["alerts"] == nil then write("error.txt", "Owned OBS Alert source is missing."); return end
  scene = obs.obs_scene_create("Security fixture scene")
  local matte_settings = obs.obs_data_create()
  obs.obs_data_set_int(matte_settings, "color", 4278190080)
  obs.obs_data_set_int(matte_settings, "width", 1920); obs.obs_data_set_int(matte_settings, "height", 1080)
  matte = obs.obs_source_create("color_source_v3", "Security fixture matte", matte_settings, nil)
  obs.obs_data_release(matte_settings)
  if matte == nil then write("error.txt", "Could not create owned contrast matte."); return end
  obs.obs_scene_add(scene, matte)
  obs.obs_frontend_set_current_scene(obs.obs_scene_get_source(scene))
  if not select_source("alerts", sources["alerts"].width, sources["alerts"].height) then
    write("error.txt", "Could not create browser_source"); return
  end
  obs.timer_add(tick, 100)
  write("ready.json", '{"ready":true,' .. snapshot() .. '}')
end

function script_description()
  return "Owned loopback browser source geometry, transparency and font fixture. No output capture, monitoring or network control."
end

function script_load(settings)
  coord = obs.obs_data_get_string(settings, "coord")
  if obs.obs_frontend_take_source_screenshot == nil or obs.obs_frontend_get_last_screenshot == nil then
    write("error.txt", "Installed OBS lacks frontend screenshot Lua functions."); return
  end
  obs.obs_frontend_add_event_callback(loaded)
end

function script_unload()
  obs.timer_remove(tick)
  obs.obs_frontend_remove_event_callback(loaded)
  if source ~= nil then obs.obs_source_release(source); source = nil end
  if matte ~= nil then obs.obs_source_release(matte); matte = nil end
  if scene ~= nil then obs.obs_scene_release(scene); scene = nil end
end
