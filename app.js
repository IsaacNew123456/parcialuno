"use strict";

(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  /** @type {{ classes: Array, relations: Array, drag: object | null, recognition: object | null, listening: boolean, lastFocused: Element | null }} */
  const state = {
    classes: [],
    relations: [],
    drag: null,
    recognition: null,
    listening: false,
    lastFocused: null,
  };

  const el = {
    canvas: document.getElementById("canvas"),
    svg: document.getElementById("connectors"),
    empty: document.getElementById("canvas-empty"),
    formClass: document.getElementById("form-class"),
    formRel: document.getElementById("form-rel"),
    classError: document.getElementById("class-error"),
    relError: document.getElementById("rel-error"),
    relFrom: document.getElementById("rel-from"),
    relTo: document.getElementById("rel-to"),
    modal: document.getElementById("code-modal"),
    help: document.getElementById("help-popover"),
    btnHelp: document.getElementById("btn-help"),
    btnMic: document.getElementById("btn-mic"),
    toast: document.getElementById("toast"),
    closeModal: document.getElementById("btn-close-modal"),
    generate: document.getElementById("btn-generate"),
    postman: document.getElementById("btn-postman"),
    zip: document.getElementById("btn-zip"),
  };

  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  const toPascal = (raw) => {
    const parts = String(raw || "")
      .trim()
      .replace(/[^A-Za-z0-9_]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "";
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  };

  const toCamel = (name) => (name ? name.charAt(0).toLowerCase() + name.slice(1) : "");
  const toSnake = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const tableName = (name) => toSnake(name);

  const parseAttrs = (text) =>
    String(text || "")
      .split(",")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [n, t] = chunk.split(":").map((s) => s && s.trim());
        const name = toCamel((n || "campo").replace(/[^A-Za-z0-9_]/g, "") || "campo");
        return { name, type: t || "String" };
      });

  const defaultMethods = (className, attrs) => {
    const methods = ["+ " + className + "()"];
    attrs.forEach((a) => {
      const prop = a.name.charAt(0).toUpperCase() + a.name.slice(1);
      methods.push("+ get" + prop + "(): " + a.type);
      methods.push("+ set" + prop + "(" + a.name + ": " + a.type + "): void");
    });
    methods.push("+ toString(): String");
    return methods;
  };

  const showToast = (msg) => {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      el.toast.hidden = true;
    }, 2800);
  };

  const nextPosition = () => {
    const n = state.classes.length;
    return { x: 48 + (n % 3) * 240, y: 40 + Math.floor(n / 3) * 220 };
  };

  const classById = (id) => state.classes.find((c) => c.id === id);

  const fillSelectOptions = (select, selectedId) => {
    const frag = document.createDocumentFragment();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— seleccionar —";
    frag.appendChild(blank);
    state.classes.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === selectedId) opt.selected = true;
      frag.appendChild(opt);
    });
    select.replaceChildren(frag);
  };

  const syncRelationSelects = () => {
    const fromId = el.relFrom.value;
    const toId = el.relTo.value;
    fillSelectOptions(el.relFrom, fromId);
    fillSelectOptions(el.relTo, toId);
  };

  const nodeBox = (node) => {
    const cr = el.canvas.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return {
      x: r.left - cr.left + r.width / 2,
      y: r.top - cr.top + r.height / 2,
      w: r.width,
      h: r.height,
    };
  };

  const edgePoint = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return { x: from.x, y: from.y };
    const sx = from.w / 2 / Math.abs(dx || 1e-6);
    const sy = from.h / 2 / Math.abs(dy || 1e-6);
    const s = Math.min(sx, sy);
    return { x: from.x + dx * s, y: from.y + dy * s };
  };

  const drawConnectors = () => {
    while (el.svg.firstChild) el.svg.removeChild(el.svg.firstChild);
    const w = el.canvas.clientWidth;
    const h = el.canvas.clientHeight;
    el.svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    el.svg.setAttribute("width", String(w));
    el.svg.setAttribute("height", String(h));

    state.relations.forEach((rel) => {
      const a = document.getElementById("node-" + rel.fromId);
      const b = document.getElementById("node-" + rel.toId);
      if (!a || !b) return;
      const ca = nodeBox(a);
      const cb = nodeBox(b);
      const p1 = edgePoint(ca, cb);
      const p2 = edgePoint(cb, ca);

      const line = document.createElementNS(SVG_NS, "path");
      line.setAttribute("d", "M " + p1.x + " " + p1.y + " L " + p2.x + " " + p2.y);
      line.setAttribute("class", "connector-line");
      el.svg.appendChild(line);

      const parts = rel.mult.split("..");
      const t1 = document.createElementNS(SVG_NS, "text");
      t1.setAttribute("class", "mult");
      t1.setAttribute("x", String(p1.x + 8));
      t1.setAttribute("y", String(p1.y - 6));
      t1.textContent = parts[0];
      const t2 = document.createElementNS(SVG_NS, "text");
      t2.setAttribute("class", "mult");
      t2.setAttribute("x", String(p2.x - 18));
      t2.setAttribute("y", String(p2.y - 6));
      t2.textContent = parts[1];
      el.svg.appendChild(t1);
      el.svg.appendChild(t2);
    });
  };

  const applyDragPosition = (cls, node, clientX, clientY) => {
    const cr = el.canvas.getBoundingClientRect();
    cls.x = Math.max(8, Math.min(clientX - state.drag.offsetX, cr.width - node.offsetWidth - 8));
    cls.y = Math.max(8, Math.min(clientY - state.drag.offsetY, cr.height - 48));
    node.style.left = cls.x + "px";
    node.style.top = cls.y + "px";
    drawConnectors();
  };

  const bindMouseDrag = (node, cls) => {
    const head = node.querySelector(".uml-class-head");

    const onMouseMove = (ev) => {
      if (!state.drag || state.drag.id !== cls.id) return;
      applyDragPosition(cls, node, ev.clientX, ev.clientY);
    };

    const onMouseUp = () => {
      if (state.drag && state.drag.id === cls.id) {
        node.classList.remove("is-dragging");
        state.drag = null;
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    head.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      node.classList.add("is-dragging");
      const cr = el.canvas.getBoundingClientRect();
      state.drag = {
        id: cls.id,
        offsetX: ev.clientX - cr.left - cls.x,
        offsetY: ev.clientY - cr.top - cls.y,
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  };

  const appendListItems = (list, items, emptyLabel) => {
    if (!items.length) {
      const li = document.createElement("li");
      li.textContent = emptyLabel;
      list.appendChild(li);
      return;
    }
    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
  };

  const renderClassCard = (cls) => {
    const node = document.createElement("article");
    node.className = "uml-class";
    node.id = "node-" + cls.id;
    node.tabIndex = 0;
    node.style.left = cls.x + "px";
    node.style.top = cls.y + "px";
    node.setAttribute("aria-label", "Clase " + cls.name);

    const head = document.createElement("div");
    head.className = "uml-class-head";
    const stereo = document.createElement("span");
    stereo.className = "uml-class-stereo";
    stereo.textContent = "«entity»";
    const title = document.createElement("span");
    title.className = "uml-class-name";
    title.textContent = cls.name;
    head.append(stereo, title);

    const attrs = document.createElement("ul");
    attrs.className = "uml-attrs";
    appendListItems(
      attrs,
      cls.attrs.map((a) => "- " + a.name + ": " + a.type),
      "(sin atributos)"
    );

    const methods = document.createElement("ul");
    methods.className = "uml-methods";
    appendListItems(methods, cls.methods, "(sin métodos)");

    node.append(head, attrs, methods);
    el.canvas.appendChild(node);
    bindMouseDrag(node, cls);
  };

  const render = () => {
    el.empty.hidden = state.classes.length > 0;
    el.canvas.querySelectorAll(".uml-class").forEach((n) => n.remove());
    state.classes.forEach(renderClassCard);
    drawConnectors();
    syncRelationSelects();
  };

  const addClass = (nameRaw, attrsText) => {
    const name = toPascal(nameRaw);
    if (!name) return { ok: false, error: "Indica un nombre de clase." };
    if (state.classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: "Ya existe una clase con ese nombre." };
    }
    let attrs = parseAttrs(attrsText);
    if (!attrs.some((a) => a.name === "id")) {
      attrs = [{ name: "id", type: "Long" }].concat(attrs);
    }
    const pos = nextPosition();
    state.classes.push({
      id: uid(),
      name,
      attrs,
      methods: defaultMethods(name, attrs),
      x: pos.x,
      y: pos.y,
    });
    render();
    return { ok: true, name };
  };

  const addRelation = (fromId, toId, mult) => {
    if (!fromId || !toId) return { ok: false, error: "Selecciona origen y destino." };
    if (fromId === toId) return { ok: false, error: "La asociación no puede ser reflexiva en este modelo." };
    if (!classById(fromId) || !classById(toId)) return { ok: false, error: "Clase inexistente." };
    if (state.relations.some((r) => r.fromId === fromId && r.toId === toId && r.mult === mult)) {
      return { ok: false, error: "Esa asociación ya existe." };
    }
    state.relations.push({ id: uid(), fromId, toId, mult });
    render();
    return { ok: true };
  };

  const JAVA_ROOT = "src/main/java/com/app";
  const FILE_SEP = "\n\n// ----------\n\n";

  const javaType = (t) => {
    const map = {
      long: "Long",
      int: "Integer",
      integer: "Integer",
      string: "String",
      bool: "Boolean",
      boolean: "Boolean",
      date: "LocalDate",
      datetime: "LocalDateTime",
      localdate: "LocalDate",
      localdatetime: "LocalDateTime",
      bigdecimal: "BigDecimal",
      double: "Double",
      float: "Double",
    };
    return map[String(t).toLowerCase()] || t;
  };

  const sqlType = (t) => {
    const j = javaType(t);
    if (j === "Long" || j === "Integer") return "BIGINT";
    if (j === "Boolean") return "BOOLEAN";
    if (j === "LocalDate") return "DATE";
    if (j === "LocalDateTime") return "TIMESTAMPTZ";
    if (j === "BigDecimal" || j === "Double") return "NUMERIC(14,2)";
    return "TEXT";
  };

  const fkSide = (rel) => {
    const from = classById(rel.fromId);
    const to = classById(rel.toId);
    return rel.mult === "1..*" ? { one: from, many: to } : { one: to, many: from };
  };

  const resourceName = (name) => {
    const kebab = toSnake(name).replace(/_/g, "-");
    return kebab.endsWith("s") ? kebab : kebab + "s";
  };

  const apiPath = (name) => "/api/" + resourceName(name);

  const relationsOf = (cls) => {
    const manyToOne = [];
    const oneToMany = [];
    state.relations.forEach((rel) => {
      const { one, many } = fkSide(rel);
      if (cls.id === many.id) manyToOne.push(one);
      if (cls.id === one.id) oneToMany.push(many);
    });
    return { manyToOne, oneToMany };
  };

  const foreignKeysOf = (cls) =>
    relationsOf(cls).manyToOne.map((one) => ({
      column: tableName(one.name) + "_id",
      table: tableName(one.name),
      one,
    }));

  const buildSchemaSql = () => {
    const lines = [
      "-- schema.sql · PostgreSQL · generado desde el modelo UML 2.5",
      "-- PKs autonuméricas (BIGSERIAL) y claves foráneas para asociaciones 1..* / *..1",
      "",
    ];
    state.classes.forEach((c) => {
      const cols = ["  id BIGSERIAL PRIMARY KEY"];
      c.attrs
        .filter((a) => a.name !== "id")
        .forEach((a) => {
          cols.push("  " + toSnake(a.name) + " " + sqlType(a.type) + " NOT NULL");
        });
      foreignKeysOf(c).forEach((fk) => {
        cols.push("  " + fk.column + " BIGINT NOT NULL");
      });
      lines.push("CREATE TABLE " + tableName(c.name) + " (\n" + cols.join(",\n") + "\n);");
      lines.push("");
    });
    state.classes.forEach((c) => {
      foreignKeysOf(c).forEach((fk) => {
        const constraint = "fk_" + tableName(c.name) + "_" + fk.table;
        lines.push(
          "ALTER TABLE " +
            tableName(c.name) +
            " ADD CONSTRAINT " +
            constraint +
            " FOREIGN KEY (" +
            fk.column +
            ") REFERENCES " +
            fk.table +
            "(id);"
        );
      });
    });
    return lines.join("\n").trim() + "\n";
  };

  const entityImports = (c) => {
    const types = new Set(c.attrs.map((a) => javaType(a.type)));
    const { manyToOne, oneToMany } = relationsOf(c);
    const imports = [
      "import jakarta.persistence.Entity;",
      "import jakarta.persistence.GeneratedValue;",
      "import jakarta.persistence.GenerationType;",
      "import jakarta.persistence.Id;",
      "import jakarta.persistence.Table;",
      "import lombok.Getter;",
      "import lombok.NoArgsConstructor;",
      "import lombok.Setter;",
    ];
    if (manyToOne.length) {
      imports.push("import jakarta.persistence.JoinColumn;", "import jakarta.persistence.ManyToOne;");
    }
    if (oneToMany.length) {
      imports.push(
        "import jakarta.persistence.OneToMany;",
        "import java.util.ArrayList;",
        "import java.util.List;"
      );
    }
    if (types.has("LocalDate")) imports.push("import java.time.LocalDate;");
    if (types.has("LocalDateTime")) imports.push("import java.time.LocalDateTime;");
    if (types.has("BigDecimal")) imports.push("import java.math.BigDecimal;");
    return [...new Set(imports)].sort().join("\n");
  };

  const buildEntity = (c) => {
    const { manyToOne, oneToMany } = relationsOf(c);
    const fields = [
      "    @Id",
      "    @GeneratedValue(strategy = GenerationType.IDENTITY)",
      "    private Long id;",
    ];
    c.attrs
      .filter((a) => a.name !== "id")
      .forEach((a) => {
        fields.push("", "    private " + javaType(a.type) + " " + a.name + ";");
      });
    manyToOne.forEach((one) => {
      fields.push(
        "",
        "    @ManyToOne(optional = false)",
        '    @JoinColumn(name = "' + tableName(one.name) + '_id")',
        "    private " + one.name + " " + toCamel(one.name) + ";"
      );
    });
    oneToMany.forEach((many) => {
      fields.push(
        "",
        '    @OneToMany(mappedBy = "' + toCamel(c.name) + '")',
        "    private List<" + many.name + "> " + toCamel(many.name) + "List = new ArrayList<>();"
      );
    });
    return (
      "package com.app.entities;\n\n" +
      entityImports(c) +
      "\n\n@Getter\n@Setter\n@NoArgsConstructor\n@Entity\n@Table(name = \"" +
      tableName(c.name) +
      "\")\npublic class " +
      c.name +
      " {\n\n" +
      fields.join("\n") +
      "\n}\n"
    );
  };

  const buildRepository = (c) =>
    "package com.app.repositories;\n\n" +
    "import com.app.entities." +
    c.name +
    ";\n" +
    "import org.springframework.data.jpa.repository.JpaRepository;\n" +
    "import org.springframework.stereotype.Repository;\n\n" +
    "@Repository\n" +
    "public interface " +
    c.name +
    "Repository extends JpaRepository<" +
    c.name +
    ", Long> {\n}\n";

  const buildService = (c) => {
    const t = c.name;
    const repo = t + "Repository";
    return (
      "package com.app.services;\n\n" +
      "import com.app.entities." +
      t +
      ";\n" +
      "import com.app.repositories." +
      repo +
      ";\n" +
      "import org.springframework.stereotype.Service;\n" +
      "import java.util.List;\n" +
      "import java.util.Optional;\n\n" +
      "@Service\n" +
      "public class " +
      t +
      "Service {\n\n" +
      "    private final " +
      repo +
      " repository;\n\n" +
      "    public " +
      t +
      "Service(" +
      repo +
      " repository) {\n" +
      "        this.repository = repository;\n" +
      "    }\n\n" +
      "    public List<" +
      t +
      "> findAll() {\n" +
      "        return repository.findAll();\n" +
      "    }\n\n" +
      "    public Optional<" +
      t +
      "> findById(Long id) {\n" +
      "        return repository.findById(id);\n" +
      "    }\n\n" +
      "    public " +
      t +
      " save(" +
      t +
      " entity) {\n" +
      "        return repository.save(entity);\n" +
      "    }\n\n" +
      "    public void delete(Long id) {\n" +
      "        repository.deleteById(id);\n" +
      "    }\n" +
      "}\n"
    );
  };

  const buildController = (c) => {
    const t = c.name;
    const path = apiPath(t);
    return (
      "package com.app.controllers;\n\n" +
      "import com.app.entities." +
      t +
      ";\n" +
      "import com.app.services." +
      t +
      "Service;\n" +
      "import org.springframework.http.HttpStatus;\n" +
      "import org.springframework.http.ResponseEntity;\n" +
      "import org.springframework.web.bind.annotation.CrossOrigin;\n" +
      "import org.springframework.web.bind.annotation.DeleteMapping;\n" +
      "import org.springframework.web.bind.annotation.GetMapping;\n" +
      "import org.springframework.web.bind.annotation.PathVariable;\n" +
      "import org.springframework.web.bind.annotation.PostMapping;\n" +
      "import org.springframework.web.bind.annotation.RequestBody;\n" +
      "import org.springframework.web.bind.annotation.RequestMapping;\n" +
      "import org.springframework.web.bind.annotation.RestController;\n" +
      "import java.util.List;\n\n" +
      "@RestController\n" +
      '@RequestMapping("' +
      path +
      '")\n' +
      '@CrossOrigin("*")\n' +
      "public class " +
      t +
      "Controller {\n\n" +
      "    private final " +
      t +
      "Service service;\n\n" +
      "    public " +
      t +
      "Controller(" +
      t +
      "Service service) {\n" +
      "        this.service = service;\n" +
      "    }\n\n" +
      "    @GetMapping\n" +
      "    public ResponseEntity<List<" +
      t +
      ">> findAll() {\n" +
      "        return ResponseEntity.ok(service.findAll());\n" +
      "    }\n\n" +
      "    @GetMapping(\"/{id}\")\n" +
      "    public ResponseEntity<" +
      t +
      "> findById(@PathVariable Long id) {\n" +
      "        return service.findById(id)\n" +
      "                .map(ResponseEntity::ok)\n" +
      "                .orElseGet(() -> ResponseEntity.notFound().build());\n" +
      "    }\n\n" +
      "    @PostMapping\n" +
      "    public ResponseEntity<" +
      t +
      "> create(@RequestBody " +
      t +
      " body) {\n" +
      "        " +
      t +
      " saved = service.save(body);\n" +
      "        return ResponseEntity.status(HttpStatus.CREATED).body(saved);\n" +
      "    }\n\n" +
      "    @DeleteMapping(\"/{id}\")\n" +
      "    public ResponseEntity<Void> delete(@PathVariable Long id) {\n" +
      "        if (service.findById(id).isEmpty()) {\n" +
      "            return ResponseEntity.notFound().build();\n" +
      "        }\n" +
      "        service.delete(id);\n" +
      "        return ResponseEntity.noContent().build();\n" +
      "    }\n" +
      "}\n"
    );
  };

  const buildPom = () => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.3</version>
    <relativePath/>
  </parent>

  <groupId>com.app</groupId>
  <artifactId>spring-boot-backend</artifactId>
  <version>1.0.0</version>
  <name>spring-boot-backend</name>
  <description>Backend Spring Boot generado desde CASE UML 2.5</description>

  <properties>
    <java.version>17</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <excludes>
            <exclude>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </exclude>
          </excludes>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;

  const buildApplicationProperties = () =>
    [
      "server.port=8080",
      "spring.datasource.url=jdbc:postgresql://localhost:5432/appdb",
      "spring.datasource.username=postgres",
      "spring.datasource.password=postgres",
      "spring.datasource.driver-class-name=org.postgresql.Driver",
      "spring.jpa.hibernate.ddl-auto=update",
      "spring.jpa.show-sql=true",
      "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect",
      "spring.jpa.open-in-view=false",
      "",
    ].join("\n");

  const buildApplicationJava = () =>
    "package com.app;\n\n" +
    "import org.springframework.boot.SpringApplication;\n" +
    "import org.springframework.boot.autoconfigure.SpringBootApplication;\n\n" +
    "@SpringBootApplication\n" +
    "public class BackendApplication {\n\n" +
    "    public static void main(String[] args) {\n" +
    "        SpringApplication.run(BackendApplication.class, args);\n" +
    "    }\n" +
    "}\n";

  const sampleBody = (c) => {
    const sample = {};
    c.attrs.forEach((a) => {
      if (a.name === "id") return;
      const j = javaType(a.type);
      if (j === "Long" || j === "Integer" || j === "Double" || j === "BigDecimal") sample[a.name] = 0;
      else if (j === "Boolean") sample[a.name] = false;
      else if (j === "LocalDate") sample[a.name] = "2026-01-15";
      else if (j === "LocalDateTime") sample[a.name] = "2026-01-15T10:00:00";
      else sample[a.name] = "";
    });
    relationsOf(c).manyToOne.forEach((one) => {
      sample[toCamel(one.name)] = { id: 1 };
    });
    return sample;
  };

  const postmanUrl = (segments) => {
    const path = segments.slice();
    return {
      raw: "http://localhost:8080/" + path.join("/"),
      protocol: "http",
      host: ["localhost"],
      port: "8080",
      path,
    };
  };

  const postmanCollection = () => {
    const jsonHeader = [{ key: "Content-Type", value: "application/json" }];
    const items = state.classes.map((c) => {
      const base = ["api", resourceName(c.name)];
      return {
        name: c.name,
        item: [
          {
            name: "GET all " + c.name,
            request: { method: "GET", header: [], url: postmanUrl(base) },
          },
          {
            name: "GET " + c.name + " by ID",
            request: { method: "GET", header: [], url: postmanUrl(base.concat(":id")) },
          },
          {
            name: "POST " + c.name,
            request: {
              method: "POST",
              header: jsonHeader,
              body: { mode: "raw", raw: JSON.stringify(sampleBody(c), null, 2) },
              url: postmanUrl(base),
            },
          },
          {
            name: "DELETE " + c.name,
            request: { method: "DELETE", header: [], url: postmanUrl(base.concat(":id")) },
          },
        ],
      };
    });
    return {
      info: {
        name: "CASE UML 2.5 API",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: items,
    };
  };

  const joinLayer = (builder) => state.classes.map(builder).join(FILE_SEP);

  const generatePreview = () => {
    if (!state.classes.length) return null;
    return {
      ddl: buildSchemaSql(),
      entity: joinLayer(buildEntity),
      repo: joinLayer(buildRepository),
      svc: joinLayer(buildService),
      ctrl: joinLayer(buildController),
    };
  };

  const buildProjectFiles = () => {
    const files = {
      "pom.xml": buildPom(),
      "schema.sql": buildSchemaSql(),
      "postman_collection.json": JSON.stringify(postmanCollection(), null, 2),
      "src/main/resources/application.properties": buildApplicationProperties(),
      [JAVA_ROOT + "/BackendApplication.java"]: buildApplicationJava(),
    };
    state.classes.forEach((c) => {
      files[JAVA_ROOT + "/entities/" + c.name + ".java"] = buildEntity(c);
      files[JAVA_ROOT + "/repositories/" + c.name + "Repository.java"] = buildRepository(c);
      files[JAVA_ROOT + "/services/" + c.name + "Service.java"] = buildService(c);
      files[JAVA_ROOT + "/controllers/" + c.name + "Controller.java"] = buildController(c);
    });
    return files;
  };

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectTab = (pane) => {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.setAttribute("aria-selected", tab.dataset.pane === pane ? "true" : "false");
    });
    document.querySelectorAll(".code-pane").forEach((p) => {
      p.hidden = p.id !== "pane-" + pane;
    });
  };

  const openModal = () => {
    const g = generatePreview();
    if (!g) {
      showToast("Crea al menos una clase antes de generar código.");
      return;
    }
    document.getElementById("pane-ddl").textContent = g.ddl;
    document.getElementById("pane-entity").textContent = g.entity;
    document.getElementById("pane-repo").textContent = g.repo;
    document.getElementById("pane-svc").textContent = g.svc;
    document.getElementById("pane-ctrl").textContent = g.ctrl;
    selectTab("ddl");
    state.lastFocused = document.activeElement;
    el.modal.hidden = false;
    el.closeModal.focus();
  };

  const closeModal = () => {
    el.modal.hidden = true;
    if (state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    } else {
      el.generate.focus();
    }
  };

  const applyVoice = (transcript) => {
    const raw = String(transcript || "").trim();
    const t = raw.replace(/[.,;:!?¡¿"']/g, "").trim();
    showToast(`Voz: "${raw}"`);

    // 1. Crear clase con atributos
    const matchWithAttrs = t.match(/^(?:crear|nueva|agregar|añadir)(?:\s+(?:la|una))?\s+clase\s+(.+?)\s+con\s+(?:los\s+)?atributos?\s+(.+)$/i);
    if (matchWithAttrs) {
      const clsName = matchWithAttrs[1].trim();
      const rawAttrs = matchWithAttrs[2].trim();
      const attrChunks = rawAttrs.split(/\s+(?:y|e)\s+|,/i);
      const formattedAttrs = attrChunks.map((c) => {
        const typeMatch = c.trim().match(/^([a-záéíóúñ0-9_]+)(?:\s+(?:de\s+tipo|tipo|:)\s+([a-záéíóúñ0-9_]+))?$/i);
        if (typeMatch) {
          const aName = typeMatch[1].trim();
          const aType = typeMatch[2] ? typeMatch[2].trim() : "String";
          return `${aName}:${aType}`;
        }
        return c.trim();
      }).join(", ");

      const r = addClass(clsName, formattedAttrs);
      showToast(r.ok ? `Clase "${r.name}" creada con atributos [${formattedAttrs}] ✓` : r.error);
      return;
    }

    // 2. Crear clase simple
    const matchSimple = t.match(/^(?:crear|nueva|agregar|añadir)(?:\s+(?:la|una))?\s+clase\s+(.+)$/i);
    if (matchSimple) {
      const r = addClass(matchSimple[1].trim(), "");
      showToast(r.ok ? `Clase "${r.name}" creada por voz ✓` : r.error);
      return;
    }

    // 3. Descargar proyecto
    if (/^(?:descargar|generar|exportar)(?:\s+(?:el|un))?\s+(?:proyecto|backend|zip)/i.test(t)) {
      showToast("Descargando proyecto backend...");
      el.zip.click();
      return;
    }

    // 4. Generar código
    if (/^(?:generar|ver|mostrar)(?:\s+(?:el))?\s+código/i.test(t)) {
      openModal();
      return;
    }

    showToast(`No reconocí el comando. Di: "crear clase Pedido con atributo total tipo BigDecimal"`);
  };

  const toggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Este navegador no expone reconocimiento de voz.");
      return;
    }
    if (state.listening && state.recognition) {
      state.recognition.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => applyVoice(ev.results[0][0].transcript);
    rec.onend = () => {
      state.listening = false;
      el.btnMic.setAttribute("aria-pressed", "false");
    };
    rec.onerror = () => {
      state.listening = false;
      el.btnMic.setAttribute("aria-pressed", "false");
      showToast("Error al capturar audio.");
    };
    state.recognition = rec;
    state.listening = true;
    el.btnMic.setAttribute("aria-pressed", "true");
    rec.start();
    showToast("Escuchando… di: crear clase Cliente");
  };

  el.formClass.addEventListener("submit", (e) => {
    e.preventDefault();
    el.classError.textContent = "";
    const r = addClass(
      document.getElementById("class-name").value,
      document.getElementById("class-attrs").value
    );
    if (!r.ok) {
      el.classError.textContent = r.error;
      return;
    }
    el.formClass.reset();
    document.getElementById("class-name").focus();
  });

  el.formRel.addEventListener("submit", (e) => {
    e.preventDefault();
    el.relError.textContent = "";
    const r = addRelation(el.relFrom.value, el.relTo.value, document.getElementById("rel-mult").value);
    if (!r.ok) el.relError.textContent = r.error;
  });

  el.generate.addEventListener("click", openModal);
  el.closeModal.addEventListener("click", closeModal);
  el.modal.addEventListener("click", (e) => {
    if (e.target === el.modal) closeModal();
  });

  el.postman.addEventListener("click", () => {
    if (!state.classes.length) {
      showToast("No hay clases para exportar.");
      return;
    }
    const blob = new Blob([JSON.stringify(postmanCollection(), null, 2)], {
      type: "application/json",
    });
    downloadBlob("postman_collection.json", blob);
    showToast("Colección Postman v2.1 descargada.");
  });

  el.zip.addEventListener("click", async () => {
    if (!state.classes.length) {
      showToast("Crea al menos una clase antes de descargar el ZIP.");
      return;
    }
    if (typeof JSZip === "undefined") {
      showToast("JSZip no está disponible. Revisa la conexión al CDN.");
      return;
    }
    try {
      const zip = new JSZip();
      const root = zip.folder("spring-boot-backend");
      const files = buildProjectFiles();
      Object.keys(files).forEach((path) => {
        root.file(path, files[path]);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob("spring-boot-backend.zip", blob);
      showToast("Proyecto spring-boot-backend.zip descargado.");
    } catch (err) {
      showToast("No se pudo generar el ZIP.");
    }
  });

  const tabs = Array.from(document.querySelectorAll(".tab"));
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.pane));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      selectTab(tabs[next].dataset.pane);
    });
  });

  el.btnHelp.addEventListener("click", () => {
    const willOpen = el.help.hidden;
    el.help.hidden = !willOpen;
    el.btnHelp.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  el.btnMic.addEventListener("click", toggleMic);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!el.modal.hidden) closeModal();
      el.help.hidden = true;
      el.btnHelp.setAttribute("aria-expanded", "false");
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === "?" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
      el.help.hidden = false;
      el.btnHelp.setAttribute("aria-expanded", "true");
    }
  });

  window.addEventListener("resize", drawConnectors);
  syncRelationSelects();
})();
