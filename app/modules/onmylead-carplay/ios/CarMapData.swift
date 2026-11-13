import Foundation

/// What the car map draws (shape: CarMap in src/core/carplay.ts). Parsed by hand, so a field an
/// older or newer phone build doesn't send just drops out instead of failing the whole update.
struct CarMapData: Equatable {
  struct Dot: Equatable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let color: String
    let ring: String?
    let live: Bool
  }

  struct Line: Equatable {
    let id: String
    /// Latitude, longitude pairs (the phone sends [lng, lat], GeoJSON order).
    let points: [(lat: Double, lng: Double)]
    let color: String
    let width: Double

    static func == (a: Line, b: Line) -> Bool {
      a.id == b.id && a.color == b.color && a.width == b.width && a.points.count == b.points.count
        && zip(a.points, b.points).allSatisfy { $0.lat == $1.lat && $0.lng == $1.lng }
    }
  }

  /// One turn-by-turn step (CarManeuver in src/core/car-maneuvers.ts).
  struct Step: Equatable {
    let id: String
    let turn: String
    let instruction: String
    let distanceM: Double
  }

  struct Guide: Equatable {
    let id: String
    let instruction: String
    let remainingM: Double
    let remainingS: Double
    let endLat: Double
    let endLng: Double
    let endName: String
    /// Next step first. Empty from an older phone build: the car shows `instruction` alone.
    let steps: [Step]
  }

  /// The rider line (CarRiderBar in src/core/carplay.ts): leader left, tail gunner right.
  struct Bar: Equatable {
    struct Dot: Equatable {
      let id: String
      let x: Double
      let size: Double
      let color: String
      let ring: String?
      let me: Bool
      let live: Bool
    }
    let dots: [Dot]
    let spread: String?
    let ends: String?
  }

  let style: String
  let token: String
  let dots: [Dot]
  let lines: [Line]
  let guide: Guide?
  /// Nil from an older phone build or with fewer than two riders on the line.
  let bar: Bar?

  /// Nil when the phone sent no map (Driving Task builds of the phone code, or nothing to draw yet).
  init?(_ any: Any?) {
    guard let d = any as? [String: Any] else { return nil }
    style = d["style"] as? String ?? "mapbox://styles/mapbox/outdoors-v12"
    token = d["token"] as? String ?? ""
    dots = (d["dots"] as? [Any] ?? []).compactMap { item in
      guard let o = item as? [String: Any], let id = o["id"] as? String,
            let lat = CarMapData.num(o["lat"]), let lng = CarMapData.num(o["lng"]) else { return nil }
      return Dot(
        id: id,
        name: o["name"] as? String ?? "",
        lat: lat,
        lng: lng,
        color: o["color"] as? String ?? "#4A5A72",
        ring: o["ring"] as? String,
        live: o["live"] as? Bool ?? true
      )
    }
    lines = (d["lines"] as? [Any] ?? []).compactMap { item in
      guard let o = item as? [String: Any], let id = o["id"] as? String else { return nil }
      let points: [(lat: Double, lng: Double)] = (o["coords"] as? [Any] ?? []).compactMap { pair in
        guard let p = pair as? [Any], p.count >= 2, let lng = CarMapData.num(p[0]), let lat = CarMapData.num(p[1]) else { return nil }
        return (lat: lat, lng: lng)
      }
      guard points.count >= 2 else { return nil }
      return Line(id: id, points: points, color: o["color"] as? String ?? "#E5262E", width: CarMapData.num(o["width"]) ?? 5)
    }
    if let g = d["guide"] as? [String: Any], let id = g["id"] as? String, let text = g["instruction"] as? String,
       let endLat = CarMapData.num(g["endLat"]), let endLng = CarMapData.num(g["endLng"]) {
      guide = Guide(
        id: id,
        instruction: text,
        remainingM: max(0, CarMapData.num(g["remainingM"]) ?? 0),
        remainingS: max(0, CarMapData.num(g["remainingS"]) ?? 0),
        endLat: endLat,
        endLng: endLng,
        endName: g["endName"] as? String ?? text,
        steps: (g["steps"] as? [Any] ?? []).compactMap { item in
          guard let o = item as? [String: Any], let id = o["id"] as? String, let words = o["instruction"] as? String else { return nil }
          return Step(id: id, turn: o["turn"] as? String ?? "", instruction: words, distanceM: max(0, CarMapData.num(o["distanceM"]) ?? 0))
        }
      )
    } else {
      guide = nil
    }
    if let b = d["bar"] as? [String: Any] {
      let barDots: [Bar.Dot] = (b["dots"] as? [Any] ?? []).compactMap { item in
        guard let o = item as? [String: Any], let id = o["id"] as? String, let x = CarMapData.num(o["x"]) else { return nil }
        return Bar.Dot(
          id: id,
          x: min(1, max(0, x)),
          size: min(1, max(0.2, CarMapData.num(o["size"]) ?? 0.7)),
          color: o["color"] as? String ?? "#4A5A72",
          ring: o["ring"] as? String,
          me: o["me"] as? Bool ?? false,
          live: o["live"] as? Bool ?? true
        )
      }
      bar = barDots.count >= 2 ? Bar(dots: barDots, spread: b["spread"] as? String, ends: b["ends"] as? String) : nil
    } else {
      bar = nil
    }
  }

  static func num(_ v: Any?) -> Double? {
    if let n = v as? NSNumber { return n.doubleValue.isFinite ? n.doubleValue : nil }
    if let n = v as? Double { return n.isFinite ? n : nil }
    if let n = v as? Int { return Double(n) }
    return nil
  }
}
