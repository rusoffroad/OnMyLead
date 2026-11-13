import CarPlay
import MapKit
import UIKit

#if OML_CARPLAY_MAPS && canImport(MapboxMaps)
import MapboxMaps

/// The car screen as a map (CarPlay Navigation entitlement, com.apple.developer.carplay-maps).
///
/// The root is a CPMapTemplate. Under it, in the car's own window, CarMapViewController draws the
/// Mapbox map: your position (the map's own location puck, so it moves with the car's GPS), the
/// line you follow and the other riders. Nothing but the map is drawn in that window (Apple's rule
/// for the base view); every control is a template button:
/// - map buttons: zoom in, zoom out, back to following you, and the panning arrows (for cars
///   without a touchscreen);
/// - the bar: Ride (the one-tap grid: statuses, Regroup, EMERGENCY) and Group during a ride, Dash
///   (Map Mode's readouts) and Pause/Resume in Map Mode, Open Map Mode when nothing is running;
/// - guidance: while you follow a trail or the ride route, a navigation session shows
///   "Follow <trail>" (or "Head to the Start") with the distance and time left.
///
/// On Free (CarPlay is Pro) the root is a list with the Pro notice instead.
final class CarMapScreen: NSObject, CPMapTemplateDelegate {
  /// The map is built only when plugins/with-carplay.js switched it on (OMLCarPlayMaps), which it
  /// does only alongside the entitlement.
  static var available: Bool {
    Bundle.main.object(forInfoDictionaryKey: "OMLCarPlayMaps") as? Bool == true
  }

  private weak var bridge: CarPlayBridge?
  private let interface: CPInterfaceController
  private let window: UIWindow
  private let mapView = CarMapViewController()
  private var mapTemplate: CPMapTemplate?
  private var proList: CPListTemplate?
  private var barKey = ""
  private var panning = false

  // Pushed screens that follow the phone while they are open.
  private weak var rideGrid: CPGridTemplate?
  private weak var dashList: CPListTemplate?
  /// What those screens show now, so they are only redrawn when it changes (CarPlay limits
  /// template updates; rider spots change every few seconds but the buttons rarely do).
  private var gridShows: RideState?
  private var dashShows: MapState?

  // Guidance.
  private var session: CPNavigationSession?
  private var trip: CPTrip?
  private var maneuvers: [CPManeuver] = []
  private var stepIds: [String] = []
  private var guideId: String?

  init(bridge: CarPlayBridge, interface: CPInterfaceController, window: UIWindow) {
    self.bridge = bridge
    self.interface = interface
    self.window = window
    super.init()
    window.rootViewController = mapView
  }

  func tearDown() {
    finishGuide()
    mapTemplate?.mapDelegate = nil
    mapTemplate = nil
    window.rootViewController = nil
  }

  /// Redraws from the bridge's latest ride, Map Mode and words. Cheap when nothing changed.
  func refresh() {
    guard let bridge else { return }
    let labels = bridge.labels
    if labels.proNeeded && bridge.state == nil {
      showProNotice(labels)
      return
    }
    let root = ensureMapTemplate()
    let map = bridge.state != nil ? bridge.rideMap : bridge.modeMap
    mapView.show(map)
    updateBar(root, bridge: bridge, labels: labels)
    updateGuide(root, map?.guide)
    if let rideGrid, let state = bridge.state, state != gridShows {
      gridShows = state
      rideGrid.updateTitle(state.title)
      rideGrid.updateGridButtons(bridge.gridButtons(state))
    }
    if let dashList, let mapState = bridge.mapState, mapState != dashShows {
      dashShows = mapState
      dashList.updateSections([CPListSection(items: dashItems(mapState))])
    }
    if let state = bridge.state { bridge.showAlertIfNew(state) }
  }

  // MARK: Templates

  private func showProNotice(_ labels: CarPlayLabels) {
    finishGuide()
    mapView.show(nil)
    if proList == nil || mapTemplate != nil {
      let list = CPListTemplate(title: "OnMyLead", sections: [])
      list.emptyViewTitleVariants = [labels.waitingTitle]
      list.emptyViewSubtitleVariants = [labels.waitingDetail]
      proList = list
      mapTemplate = nil
      barKey = ""
      interface.setRootTemplate(list, animated: false, completion: nil)
    } else if let proList {
      proList.emptyViewTitleVariants = [labels.waitingTitle]
      proList.emptyViewSubtitleVariants = [labels.waitingDetail]
    }
  }

  private func ensureMapTemplate() -> CPMapTemplate {
    if let mapTemplate { return mapTemplate }
    let t = CPMapTemplate()
    t.mapDelegate = self
    t.automaticallyHidesNavigationBar = false
    t.mapButtons = [
      mapButton("plus.magnifyingglass") { [weak self] in self?.mapView.zoom(by: 1) },
      mapButton("minus.magnifyingglass") { [weak self] in self?.mapView.zoom(by: -1) },
      mapButton("location.fill") { [weak self] in self?.mapView.follow() },
      mapButton("arrow.up.and.down.and.arrow.left.and.right") { [weak self] in
        self?.mapTemplate?.showPanningInterface(animated: true)
      },
    ]
    mapTemplate = t
    proList = nil
    barKey = ""
    interface.setRootTemplate(t, animated: false, completion: nil)
    return t
  }

  private func mapButton(_ symbol: String, _ action: @escaping () -> Void) -> CPMapButton {
    let b = CPMapButton { _ in action() }
    b.image = UIImage(systemName: symbol)
    return b
  }

  /// The bar's buttons, rebuilt only when what they say changes (CarPlay limits template updates).
  private func updateBar(_ t: CPMapTemplate, bridge: CarPlayBridge, labels: CarPlayLabels) {
    // Pause or Resume; Exit has its own button on the left.
    let recording = bridge.state == nil ? bridge.mapState?.actions.first(where: { $0.id != "map:exit" }) : nil
    let key = [
      panning ? "pan" : "",
      bridge.state != nil ? "ride" : bridge.mapState != nil ? "mode" : "none",
      labels.ride, labels.group, labels.messages, labels.dash, labels.openMapMode, labels.ok, labels.exit,
      recording?.id ?? "", recording?.title ?? "",
    ].joined(separator: "|")
    guard key != barKey else { return }
    barKey = key
    if panning {
      t.leadingNavigationBarButtons = [CPBarButton(title: labels.ok) { [weak self] _ in
        self?.mapTemplate?.dismissPanningInterface(animated: true)
      }]
      t.trailingNavigationBarButtons = []
      return
    }
    if bridge.state != nil {
      t.leadingNavigationBarButtons = [
        bridge.exitRideButton(),
        CPBarButton(title: labels.ride) { [weak self] _ in self?.pushRideGrid() },
      ]
      t.trailingNavigationBarButtons = [
        CPBarButton(title: labels.group) { [weak self] _ in self?.bridge?.showGroup() },
        bridge.messagesButton(),
      ]
    } else if bridge.mapState != nil {
      t.leadingNavigationBarButtons = [
        CPBarButton(title: labels.exit) { [weak self] _ in self?.bridge?.exitMap() },
        CPBarButton(title: labels.dash) { [weak self] _ in self?.pushDash() },
      ]
      if let recording {
        t.trailingNavigationBarButtons = [CPBarButton(title: recording.title) { [weak self] _ in self?.bridge?.emit?(recording.id) }]
      } else {
        t.trailingNavigationBarButtons = []
      }
    } else {
      t.leadingNavigationBarButtons = labels.openMapMode.isEmpty ? [] : [
        CPBarButton(title: labels.openMapMode) { [weak self] _ in self?.bridge?.emit?("open:map") },
      ]
      t.trailingNavigationBarButtons = []
    }
  }

  private func pushRideGrid() {
    guard let bridge, let state = bridge.state else { return }
    let grid = CPGridTemplate(title: state.title, gridButtons: bridge.gridButtons(state))
    rideGrid = grid
    gridShows = state
    interface.pushTemplate(grid, animated: true, completion: nil)
  }

  private func pushDash() {
    guard let mapState = bridge?.mapState else { return }
    let list = CPListTemplate(title: mapState.title, sections: [CPListSection(items: dashItems(mapState))])
    dashList = list
    dashShows = mapState
    interface.pushTemplate(list, animated: true, completion: nil)
  }

  private func dashItems(_ m: MapState) -> [CPListItem] {
    m.items.prefix(10).map { CPListItem(text: $0.title, detailText: $0.detail) }
  }

  // MARK: Guidance

  private func updateGuide(_ t: CPMapTemplate, _ g: CarMapData.Guide?) {
    guard let g else { return finishGuide() }
    if session == nil || guideId != g.id {
      finishGuide()
      let end = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: g.endLat, longitude: g.endLng)))
      end.name = g.endName
      let choice = CPRouteChoice(summaryVariants: [g.instruction], additionalInformationVariants: [], selectionSummaryVariants: [])
      let newTrip = CPTrip(origin: MKMapItem.forCurrentLocation(), destination: end, routeChoices: [choice])
      session = t.startNavigationSession(for: newTrip)
      trip = newTrip
      guideId = g.id
    }
    guard let session, let trip else { return }
    // Turn-by-turn: the next step and the one after. Only rebuilt when the steps change (a step
    // passed); the distance to the next one is updated in place every time.
    let steps = g.steps.isEmpty
      ? [CarMapData.Step(id: g.id, turn: g.id.hasPrefix("start:") ? "start" : "straight", instruction: g.instruction, distanceM: g.remainingM)]
      : g.steps
    let ids = steps.map(\.id)
    if ids != stepIds {
      maneuvers = steps.map { step in
        let m = CPManeuver()
        m.instructionVariants = [step.instruction]
        m.symbolImage = UIImage(systemName: CarMapScreen.symbol(step.turn))
        m.initialTravelEstimates = CarMapScreen.estimates(step.distanceM, nil)
        return m
      }
      session.upcomingManeuvers = maneuvers
      stepIds = ids
    }
    if let first = maneuvers.first, let step = steps.first {
      session.updateEstimates(CarMapScreen.estimates(step.distanceM, nil), for: first)
    }
    t.update(CarMapScreen.estimates(g.remainingM, g.remainingS), for: trip, with: .default)
  }

  private static func estimates(_ meters: Double, _ seconds: Double?) -> CPTravelEstimates {
    // Feet and miles in the US, metres and kilometres elsewhere: the car formats it for the locale.
    CPTravelEstimates(distanceRemaining: Measurement(value: meters, unit: UnitLength.meters), timeRemaining: seconds ?? 0)
  }

  /// SF Symbols for each step (src/core/car-maneuvers.ts CarTurn).
  static func symbol(_ turn: String) -> String {
    switch turn {
    case "left": return "arrow.turn.up.left"
    case "right": return "arrow.turn.up.right"
    case "bearLeft": return "arrow.up.left"
    case "bearRight": return "arrow.up.right"
    case "sharpLeft": return "arrow.down.left"
    case "sharpRight": return "arrow.down.right"
    case "uTurn": return "arrow.uturn.down"
    case "arrive": return "mappin.circle.fill"
    case "start": return "location.north.line.fill"
    default: return "arrow.up"
    }
  }

  private func finishGuide() {
    session?.finishTrip()
    session = nil
    trip = nil
    maneuvers = []
    stepIds = []
    guideId = nil
  }

  // MARK: CPMapTemplateDelegate

  func mapTemplateDidShowPanningInterface(_ mapTemplate: CPMapTemplate) {
    panning = true
    mapView.stopFollowing()
    refresh()
  }

  func mapTemplateDidDismissPanningInterface(_ mapTemplate: CPMapTemplate) {
    panning = false
    refresh()
  }

  func mapTemplate(_ mapTemplate: CPMapTemplate, panWith direction: CPMapTemplate.PanDirection) {
    mapView.pan(direction)
  }

  func mapTemplateDidBeginPanGesture(_ mapTemplate: CPMapTemplate) {
    mapView.beginDrag()
  }

  func mapTemplate(_ mapTemplate: CPMapTemplate, didUpdatePanGestureWithTranslation translation: CGPoint, velocity: CGPoint) {
    mapView.drag(to: translation)
  }

  func mapTemplate(_ mapTemplate: CPMapTemplate, didEndPanGestureWithVelocity velocity: CGPoint) {
    mapView.endDrag()
  }
}

/// The Mapbox map in the car's window. Map only: no ornaments, no controls.
final class CarMapViewController: UIViewController {
  private var mapView: MapView?
  private var lineManager: PolylineAnnotationManager?
  private var dotManager: CircleAnnotationManager?
  private var nameManager: PointAnnotationManager?
  private var shown: CarMapData?
  private var styleURL = ""
  private var following = true
  private var zoomLevel: CGFloat = 14
  private var lastDrag: CGPoint = .zero

  /// Draws `data` (nil: just the base map and your position). Builds the map the first time
  /// there is a Mapbox token.
  func show(_ data: CarMapData?) {
    if MapboxOptions.accessToken.isEmpty {
      // The phone's token, or the one the build put in Info.plist (plugins/with-carplay.js), so
      // the car map draws even when CarPlay starts the app before any phone screen has run.
      let bundled = Bundle.main.object(forInfoDictionaryKey: "OMLMapboxToken") as? String
      if let token = [data?.token, bundled].compactMap({ $0 }).first(where: { $0.hasPrefix("pk.") }) {
        MapboxOptions.accessToken = token
      }
    }
    guard ensureMap(style: data?.style) else { return }
    if let style = data?.style, style != styleURL, let uri = StyleURI(rawValue: style) {
      styleURL = style
      mapView?.mapboxMap.styleURI = uri
    }
    guard data != shown else { return }
    let before = shown
    shown = data
    if before?.lines != data?.lines { drawLines(data?.lines ?? []) }
    if before?.dots != data?.dots { drawDots(data?.dots ?? []) }
  }

  private func ensureMap(style: String?) -> Bool {
    if mapView != nil { return true }
    guard !MapboxOptions.accessToken.isEmpty else { return false }
    let url = style ?? "mapbox://styles/mapbox/outdoors-v12"
    styleURL = url
    let options = MapInitOptions(cameraOptions: CameraOptions(zoom: zoomLevel), styleURI: StyleURI(rawValue: url) ?? .outdoors)
    let map = MapView(frame: view.bounds, mapInitOptions: options)
    map.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    map.ornaments.options.scaleBar.visibility = .hidden
    map.ornaments.options.compass.visibility = .hidden
    map.location.options.puckType = .puck2D(.makeDefault(showBearing: true))
    map.location.options.puckBearing = .course
    map.location.options.puckBearingEnabled = true
    view.addSubview(map)
    mapView = map
    // Made in drawing order: lines under the dots, names on top.
    lineManager = map.annotations.makePolylineAnnotationManager(id: "oml-car-lines")
    dotManager = map.annotations.makeCircleAnnotationManager(id: "oml-car-dots")
    nameManager = map.annotations.makePointAnnotationManager(id: "oml-car-names")
    follow()
    return true
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
  }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    // The guidance card and the bar cover part of the window: keep you in the open part.
    if following { follow() }
  }

  private func drawLines(_ lines: [CarMapData.Line]) {
    lineManager?.annotations = lines.map { l in
      var a = PolylineAnnotation(id: l.id, lineCoordinates: l.points.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) })
      a.lineColor = StyleColor(UIColor(carHex: l.color))
      a.lineWidth = l.width
      a.lineJoin = .round
      return a
    }
  }

  private func drawDots(_ dots: [CarMapData.Dot]) {
    var circles: [CircleAnnotation] = []
    var names: [PointAnnotation] = []
    for d in dots {
      let at = CLLocationCoordinate2D(latitude: d.lat, longitude: d.lng)
      if let ring = d.ring {
        // A rider in trouble (separated, asking for help) gets a coloured ring, as on the phone.
        var r = CircleAnnotation(id: "\(d.id)-ring", centerCoordinate: at)
        r.circleRadius = 13
        r.circleOpacity = 0
        r.circleStrokeColor = StyleColor(UIColor(carHex: ring))
        r.circleStrokeWidth = 3
        r.circleSortKey = 0
        circles.append(r)
      }
      var c = CircleAnnotation(id: d.id, centerCoordinate: at)
      c.circleRadius = 8
      c.circleSortKey = 1
      c.circleStrokeColor = StyleColor(.white)
      c.circleStrokeWidth = 2
      // Live: a solid dot. Only last seen: hollow, so it never reads as where they are now.
      c.circleColor = StyleColor(UIColor(carHex: d.color))
      c.circleOpacity = d.live ? 1 : 0.15
      circles.append(c)
      var n = PointAnnotation(id: "\(d.id)-name", coordinate: at)
      n.textField = d.name
      n.textSize = 14
      n.textColor = StyleColor(.white)
      n.textHaloColor = StyleColor(UIColor.black.withAlphaComponent(0.85))
      n.textHaloWidth = 1.5
      n.textAnchor = .left
      n.textOffset = [1.1, 0]
      names.append(n)
    }
    dotManager?.annotations = circles
    nameManager?.annotations = names
  }

  // MARK: Camera

  /// Back to following you, heading up, in the part of the screen the templates leave open.
  func follow() {
    guard let mapView else { return }
    following = true
    let state = mapView.viewport.makeFollowPuckViewportState(
      options: FollowPuckViewportStateOptions(padding: view.safeAreaInsets, zoom: zoomLevel, bearing: .course, pitch: 0)
    )
    mapView.viewport.transition(to: state, transition: mapView.viewport.makeImmediateViewportTransition())
  }

  func stopFollowing() {
    guard let mapView else { return }
    following = false
    mapView.viewport.idle()
  }

  func zoom(by step: CGFloat) {
    guard let mapView else { return }
    zoomLevel = max(3, min(19, mapView.mapboxMap.cameraState.zoom + step))
    if following {
      follow()
    } else {
      mapView.camera.ease(to: CameraOptions(zoom: zoomLevel), duration: 0.3)
    }
  }

  /// The panning arrows: a third of the screen per press.
  func pan(_ direction: CPMapTemplate.PanDirection) {
    guard let mapView else { return }
    stopFollowing()
    let b = mapView.bounds
    var d = CGPoint.zero
    if direction.contains(.left) { d.x += b.width / 3 }
    if direction.contains(.right) { d.x -= b.width / 3 }
    if direction.contains(.up) { d.y += b.height / 3 }
    if direction.contains(.down) { d.y -= b.height / 3 }
    move(by: d, animated: true)
  }

  func beginDrag() {
    stopFollowing()
    lastDrag = .zero
  }

  /// A finger on a touchscreen car: the map moves with it.
  func drag(to translation: CGPoint) {
    let d = CGPoint(x: translation.x - lastDrag.x, y: translation.y - lastDrag.y)
    lastDrag = translation
    move(by: d, animated: false)
  }

  func endDrag() {
    lastDrag = .zero
  }

  /// Moves the map's content by `d` points (positive x: the map slides right).
  private func move(by d: CGPoint, animated: Bool) {
    guard let mapView else { return }
    let mid = CGPoint(x: mapView.bounds.midX, y: mapView.bounds.midY)
    let center = mapView.mapboxMap.coordinate(for: CGPoint(x: mid.x - d.x, y: mid.y - d.y))
    let to = CameraOptions(center: center)
    if animated {
      mapView.camera.ease(to: to, duration: 0.3)
    } else {
      mapView.mapboxMap.setCamera(to: to)
    }
  }
}

private extension UIColor {
  /// "#RRGGBB" (or "#RRGGBBAA") from the phone; grey if it can't be read.
  convenience init(carHex: String) {
    var s = carHex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    var v: UInt64 = 0
    guard (s.count == 6 || s.count == 8), Scanner(string: s).scanHexInt64(&v) else {
      self.init(red: 0.29, green: 0.35, blue: 0.45, alpha: 1)
      return
    }
    if s.count == 8 {
      self.init(
        red: CGFloat((v >> 24) & 0xFF) / 255, green: CGFloat((v >> 16) & 0xFF) / 255,
        blue: CGFloat((v >> 8) & 0xFF) / 255, alpha: CGFloat(v & 0xFF) / 255
      )
    } else {
      self.init(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
  }
}

#else

/// Builds without the car map (the default until Apple grants CarPlay Navigation): the Driving
/// Task screens stay.
final class CarMapScreen {
  static var available: Bool { false }
  init(bridge: CarPlayBridge, interface: CPInterfaceController, window: UIWindow) {}
  func refresh() {}
  func tearDown() {}
}

#endif
