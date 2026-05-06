package relation_view

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"r3/schema"
	"r3/types"
	"regexp"
	"strings"

	"github.com/gofrs/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type viewColumn struct {
	Name        string
	Content     string
	Length      int
	LengthFract int
	Nullable    bool
}

type viewDependency struct {
	Entity string
	Id     uuid.UUID
}
type queryRelationRef struct {
	Id         uuid.UUID
	ModuleId   uuid.UUID
	ModuleName string
	Name       string
	Alias      string
}
type queryAttributeRef struct {
	Id             uuid.UUID
	RelationId     uuid.UUID
	RelationshipId pgtype.UUID
	Name           string
	Content        string
	ContentUse     string
}
type definitionOutputRef struct {
	Expr      string
	Column    types.RelationViewDefinitionColumn
	Attribute queryAttributeRef
}

var tokenRe = regexp.MustCompile(`\{(REL|ATR|PGF|RELID|ATRID|PGFID):([^}]+)\}`)
var numericLiteralRe = regexp.MustCompile(`^-?[0-9]+(\.[0-9]+)?$`)

func EnsureSchema_tx(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS app.relation_view (
			relation_id uuid NOT NULL,
			has_id boolean NOT NULL DEFAULT true,
			managed boolean NOT NULL DEFAULT false,
			sql text,
			sql_template text,
			definition_json jsonb,
			CONSTRAINT relation_view_pkey PRIMARY KEY (relation_id),
			CONSTRAINT relation_view_relation_id_fkey FOREIGN KEY (relation_id)
				REFERENCES app.relation (id) MATCH SIMPLE
				ON UPDATE CASCADE
				ON DELETE CASCADE
				DEFERRABLE INITIALLY DEFERRED
		);
		ALTER TABLE app.relation_view
			ADD COLUMN IF NOT EXISTS sql_template text;
		ALTER TABLE app.relation_view
			ADD COLUMN IF NOT EXISTS definition_json jsonb;

		CREATE TABLE IF NOT EXISTS app.relation_view_depends (
			relation_id uuid NOT NULL,
			entity text NOT NULL,
			entity_id uuid NOT NULL,
			CONSTRAINT relation_view_depends_pkey PRIMARY KEY (relation_id, entity, entity_id),
			CONSTRAINT relation_view_depends_relation_id_fkey FOREIGN KEY (relation_id)
				REFERENCES app.relation (id) MATCH SIMPLE
				ON UPDATE CASCADE
				ON DELETE CASCADE
				DEFERRABLE INITIALLY DEFERRED
		);
		CREATE INDEX IF NOT EXISTS fki_relation_view_depends_entity
			ON app.relation_view_depends USING btree (entity, entity_id);
	`)
	return err
}

func SchemaExists_tx(ctx context.Context, tx pgx.Tx) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT TO_REGCLASS('app.relation_view') IS NOT NULL`).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func Get_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID) (*types.RelationView, error) {
	exists, err := SchemaExists_tx(ctx, tx)
	if err != nil || !exists {
		return nil, err
	}
	if err := EnsureSchema_tx(ctx, tx); err != nil {
		return nil, err
	}

	var v types.RelationView
	var definitionJson []byte
	if err := tx.QueryRow(ctx, `
		SELECT relation_id, has_id, managed, sql, sql_template, definition_json
		FROM app.relation_view
		WHERE relation_id = $1
	`, relationId).Scan(&v.RelationId, &v.HasId, &v.Managed, &v.Sql, &v.SqlTemplate, &definitionJson); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if len(definitionJson) != 0 {
		var def types.RelationViewDefinition
		if err := json.Unmarshal(definitionJson, &def); err != nil {
			return nil, err
		}
		v.Definition = &def
	}
	return &v, nil
}

func Set_tx(ctx context.Context, tx pgx.Tx, rel types.Relation) error {
	if rel.View == nil {
		return nil
	}
	if err := EnsureSchema_tx(ctx, tx); err != nil {
		return err
	}

	modName, err := schema.GetModuleNameById_tx(ctx, tx, rel.ModuleId)
	if err != nil {
		return err
	}

	var definitionJson []byte
	if rel.View.Managed {
		var sqlResolved string
		var sqlTemplateCanonical string
		var dependencies []viewDependency

		if rel.View.Definition != nil {
			definitionJson, err = json.Marshal(rel.View.Definition)
			if err != nil {
				return err
			}
			sqlResolved, dependencies, err = GenerateDefinitionSql_tx(ctx, tx, *rel.View.Definition)
			if err != nil {
				return err
			}
			sqlTemplateCanonical = ""
		} else {
			sqlTemplate := rel.View.Sql
			if rel.View.SqlTemplate.Valid && strings.TrimSpace(rel.View.SqlTemplate.String) != "" {
				sqlTemplate = rel.View.SqlTemplate
			}
			if !sqlTemplate.Valid || strings.TrimSpace(sqlTemplate.String) == "" {
				return fmt.Errorf("managed view relation requires SQL or view definition")
			}

			sqlResolved, sqlTemplateCanonical, dependencies, err = ProcessSql_tx(ctx, tx, sqlTemplate.String)
			if err != nil {
				return err
			}
		}

		if rel.View.Definition != nil {
			if err := alignViewDefinitionColumns_tx(ctx, tx, modName, rel.Name, *rel.View.Definition); err != nil {
				return err
			}
		}

		if _, err := tx.Exec(ctx, fmt.Sprintf(`CREATE OR REPLACE VIEW "%s"."%s" AS %s`,
			modName, rel.Name, sqlResolved)); err != nil {

			return err
		}
		rel.View.Sql = pgtype.Text{String: sqlResolved, Valid: true}
		rel.View.SqlTemplate = pgtype.Text{String: sqlTemplateCanonical, Valid: sqlTemplateCanonical != ""}

		if err := setDependencies_tx(ctx, tx, rel.Id, dependencies); err != nil {
			return err
		}
	} else if _, err := tx.Exec(ctx, `DELETE FROM app.relation_view_depends WHERE relation_id = $1`, rel.Id); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO app.relation_view (relation_id, has_id, managed, sql, sql_template, definition_json)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (relation_id) DO UPDATE
		SET has_id = $2, managed = $3, sql = $4, sql_template = $5, definition_json = $6
	`, rel.Id, rel.View.HasId, rel.View.Managed, rel.View.Sql, rel.View.SqlTemplate, definitionJson); err != nil {
		return err
	}

	return SyncAttributes_tx(ctx, tx, rel.Id)
}

func RecreateAffectedBy_tx(ctx context.Context, tx pgx.Tx, entity string, entityId uuid.UUID) error {
	if err := EnsureSchema_tx(ctx, tx); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		SELECT relation_id
		FROM app.relation_view_depends
		WHERE entity = $1
		AND   entity_id = $2
		ORDER BY relation_id ASC
	`, entity, entityId)
	if err != nil {
		return err
	}
	defer rows.Close()

	relationIds := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return err
		}
		relationIds = append(relationIds, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, id := range relationIds {
		rel, err := getRelation_tx(ctx, tx, id)
		if err != nil {
			return err
		}
		if rel.View == nil || !rel.View.Managed {
			continue
		}
		if err := Set_tx(ctx, tx, rel); err != nil {
			return fmt.Errorf("failed to recreate affected view '%s', %s", rel.Name, err)
		}
	}
	return nil
}

func ProcessSql_tx(ctx context.Context, tx pgx.Tx, sql string) (string, string, []viewDependency, error) {
	var out strings.Builder
	var canonical strings.Builder
	var dependencies []viewDependency
	depSeen := make(map[string]bool)
	pos := 0

	matches := tokenRe.FindAllStringSubmatchIndex(sql, -1)
	for _, match := range matches {
		out.WriteString(sql[pos:match[0]])
		canonical.WriteString(sql[pos:match[0]])

		kind := sql[match[2]:match[3]]
		value := sql[match[4]:match[5]]

		resolved, canonicalToken, deps, err := resolveToken_tx(ctx, tx, kind, value)
		if err != nil {
			return "", "", nil, err
		}

		out.WriteString(resolved)
		canonical.WriteString(canonicalToken)

		for _, dep := range deps {
			key := fmt.Sprintf("%s:%s", dep.Entity, dep.Id)
			if !depSeen[key] {
				dependencies = append(dependencies, dep)
				depSeen[key] = true
			}
		}
		pos = match[1]
	}

	out.WriteString(sql[pos:])
	canonical.WriteString(sql[pos:])
	return out.String(), canonical.String(), dependencies, nil
}

func GenerateDefinitionSql_tx(ctx context.Context, tx pgx.Tx, def types.RelationViewDefinition) (string, []viewDependency, error) {
	if def.BaseRelationId == uuid.Nil {
		return "", nil, fmt.Errorf("view definition requires base relation")
	}
	if len(def.Columns) == 0 {
		return "", nil, fmt.Errorf("view definition requires at least one column")
	}

	relations := make(map[uuid.UUID]queryRelationRef)
	deps := make([]viewDependency, 0)
	depSeen := make(map[string]bool)
	addDep := func(entity string, id uuid.UUID) {
		key := fmt.Sprintf("%s:%s", entity, id)
		if !depSeen[key] {
			deps = append(deps, viewDependency{Entity: entity, Id: id})
			depSeen[key] = true
		}
	}
	loadRelation := func(id uuid.UUID) (queryRelationRef, error) {
		if ref, exists := relations[id]; exists {
			return ref, nil
		}
		var ref queryRelationRef
		ref.Id = id
		if err := tx.QueryRow(ctx, `
			SELECT m.id, m.name, r.name
			FROM app.relation AS r
			JOIN app.module AS m ON m.id = r.module_id
			WHERE r.id = $1
		`, id).Scan(&ref.ModuleId, &ref.ModuleName, &ref.Name); err != nil {
			return ref, err
		}
		ref.Alias = fmt.Sprintf("r%d", len(relations))
		relations[id] = ref
		addDep(string(schema.DbModule), ref.ModuleId)
		addDep(string(schema.DbRelation), ref.Id)
		return ref, nil
	}
	loadAttribute := func(id uuid.UUID) (queryAttributeRef, error) {
		var ref queryAttributeRef
		if err := tx.QueryRow(ctx, `
			SELECT id, relation_id, relationship_id, name, content, content_use
			FROM app.attribute
			WHERE id = $1
		`, id).Scan(&ref.Id, &ref.RelationId, &ref.RelationshipId, &ref.Name, &ref.Content, &ref.ContentUse); err != nil {
			return ref, err
		}
		addDep(string(schema.DbAttribute), ref.Id)
		return ref, nil
	}

	base, err := loadRelation(def.BaseRelationId)
	if err != nil {
		return "", nil, err
	}
	joinByRelation := make(map[uuid.UUID]types.RelationViewDefinitionJoin)
	joinSql := make([]string, 0, len(def.Joins))
	for _, join := range def.Joins {
		if join.RelationId == uuid.Nil || join.AttributeId == uuid.Nil {
			return "", nil, fmt.Errorf("view definition join requires relation and attribute")
		}
		if _, exists := joinByRelation[join.RelationId]; exists {
			return "", nil, fmt.Errorf("view definition relation is joined more than once")
		}
		joinRel, err := loadRelation(join.RelationId)
		if err != nil {
			return "", nil, err
		}
		joinAtr, err := loadAttribute(join.AttributeId)
		if err != nil {
			return "", nil, err
		}
		if !joinAtr.RelationshipId.Valid {
			return "", nil, fmt.Errorf("view definition join attribute must be a relationship")
		}

		var sourceRel queryRelationRef
		var targetRel queryRelationRef
		if joinAtr.RelationId == joinRel.Id {
			var targetKnown bool
			targetRel, targetKnown = relations[joinAtr.RelationshipId.Bytes]
			if !targetKnown {
				return "", nil, fmt.Errorf("view definition join target relation must be the base relation or a previous join")
			}
			sourceRel = joinRel
		} else if joinAtr.RelationshipId.Bytes == joinRel.Id {
			var sourceKnown bool
			sourceRel, sourceKnown = relations[joinAtr.RelationId]
			if !sourceKnown {
				return "", nil, fmt.Errorf("view definition join source relation must be the base relation or a previous join")
			}
			targetRel = joinRel
		} else {
			return "", nil, fmt.Errorf("view definition join attribute must connect the joined relation")
		}

		targetPk, err := getPkAttribute_tx(ctx, tx, targetRel.Id)
		if err != nil {
			return "", nil, err
		}
		addDep(string(schema.DbAttribute), targetPk.Id)

		joinType := "LEFT JOIN"
		if join.Required {
			joinType = "JOIN"
		}
		joinSql = append(joinSql, fmt.Sprintf("%s \"%s\".\"%s\" AS \"%s\" ON \"%s\".\"%s\" = \"%s\".\"%s\"",
			joinType, joinRel.ModuleName, joinRel.Name, joinRel.Alias,
			sourceRel.Alias, joinAtr.Name, targetRel.Alias, targetPk.Name))
		joinByRelation[join.RelationId] = join
	}

	loadColumnAttribute := func(relationId uuid.UUID, attributeId uuid.UUID, subject string) (queryRelationRef, queryAttributeRef, error) {
		if relationId == uuid.Nil || attributeId == uuid.Nil {
			return queryRelationRef{}, queryAttributeRef{}, fmt.Errorf("view definition %s requires relation and attribute", subject)
		}
		rel, err := loadRelation(relationId)
		if err != nil {
			return queryRelationRef{}, queryAttributeRef{}, err
		}
		if rel.Id != base.Id {
			if _, exists := joinByRelation[rel.Id]; !exists {
				return queryRelationRef{}, queryAttributeRef{}, fmt.Errorf("view definition %s relation must be base relation or joined relation", subject)
			}
		}
		atr, err := loadAttribute(attributeId)
		if err != nil {
			return queryRelationRef{}, queryAttributeRef{}, err
		}
		if atr.RelationId != rel.Id {
			return queryRelationRef{}, queryAttributeRef{}, fmt.Errorf("view definition %s attribute does not belong to selected relation", subject)
		}
		return rel, atr, nil
	}

	selects := make([]string, 0, len(def.Columns))
	groupBy := make([]string, 0)
	outputs := make(map[string]definitionOutputRef)
	for _, col := range def.Columns {
		rel, atr, err := loadColumnAttribute(col.RelationId, col.AttributeId, "column")
		if err != nil {
			return "", nil, err
		}

		alias := strings.TrimSpace(col.Alias)
		if alias == "" {
			alias = atr.Name
		}
		if err := checkIdentifier(alias); err != nil {
			return "", nil, err
		}

		expr, err := getDefinitionColumnExpression(col, rel, atr)
		if err != nil {
			return "", nil, err
		}

		selectExpr, err := getDefinitionSelectExpression(expr, col.Aggregate)
		if err != nil {
			return "", nil, err
		}
		if _, exists := outputs[alias]; exists {
			return "", nil, fmt.Errorf("duplicate view definition column alias '%s'", alias)
		}
		outputs[alias] = definitionOutputRef{Expr: selectExpr, Column: col, Attribute: atr}

		if strings.TrimSpace(col.Aggregate) == "" {
			selects = append(selects, fmt.Sprintf(`%s AS "%s"`, expr, alias))
			groupBy = append(groupBy, expr)
		} else {
			selects = append(selects, fmt.Sprintf(`%s AS "%s"`, selectExpr, alias))
		}
	}

	wheres := make([]string, 0, len(def.Filters))
	for i, filter := range def.Filters {
		rel, atr, err := loadColumnAttribute(filter.RelationId, filter.AttributeId, "filter")
		if err != nil {
			return "", nil, err
		}
		expr, err := getDefinitionColumnExpression(types.RelationViewDefinitionColumn{
			RelationId:  filter.RelationId,
			AttributeId: filter.AttributeId,
			Function:    filter.Function,
			Fallback:    filter.Fallback,
		}, rel, atr)
		if err != nil {
			return "", nil, err
		}
		condition, err := getDefinitionConditionSql(expr, filter.Operator, filter.Value, atr, filter.Function, "")
		if err != nil {
			return "", nil, err
		}
		wheres = append(wheres, prefixDefinitionCondition(condition, filter.Connector, i))
	}

	havings := make([]string, 0, len(def.Havings))
	for i, having := range def.Havings {
		output, exists := outputs[strings.TrimSpace(having.ColumnAlias)]
		if !exists {
			return "", nil, fmt.Errorf("view definition HAVING column '%s' does not exist", having.ColumnAlias)
		}
		condition, err := getDefinitionConditionSql(output.Expr, having.Operator, having.Value,
			output.Attribute, output.Column.Function, output.Column.Aggregate)
		if err != nil {
			return "", nil, err
		}
		havings = append(havings, prefixDefinitionCondition(condition, having.Connector, i))
	}

	orders := make([]string, 0, len(def.Orders))
	for _, order := range def.Orders {
		alias := strings.TrimSpace(order.ColumnAlias)
		if _, exists := outputs[alias]; !exists {
			return "", nil, fmt.Errorf("view definition ORDER BY column '%s' does not exist", order.ColumnAlias)
		}
		direction := strings.ToUpper(strings.TrimSpace(order.Direction))
		if direction == "" {
			direction = "ASC"
		}
		if direction != "ASC" && direction != "DESC" {
			return "", nil, fmt.Errorf("unsupported view definition ORDER BY direction '%s'", order.Direction)
		}
		orders = append(orders, fmt.Sprintf(`"%s" %s`, alias, direction))
	}

	var sql strings.Builder
	sql.WriteString("SELECT\n\t")
	sql.WriteString(strings.Join(selects, ",\n\t"))
	sql.WriteString(fmt.Sprintf("\nFROM \"%s\".\"%s\" AS \"%s\"", base.ModuleName, base.Name, base.Alias))

	for _, join := range joinSql {
		sql.WriteString("\n")
		sql.WriteString(join)
	}
	if len(wheres) != 0 {
		sql.WriteString("\nWHERE\n\t")
		sql.WriteString(strings.Join(wheres, "\n\t"))
	}
	if len(groupBy) != 0 {
		sql.WriteString("\nGROUP BY\n\t")
		sql.WriteString(strings.Join(groupBy, ",\n\t"))
	}
	if len(havings) != 0 {
		sql.WriteString("\nHAVING\n\t")
		sql.WriteString(strings.Join(havings, "\n\t"))
	}
	if len(orders) != 0 {
		sql.WriteString("\nORDER BY\n\t")
		sql.WriteString(strings.Join(orders, ",\n\t"))
	}
	return sql.String(), deps, nil
}

func alignViewDefinitionColumns_tx(ctx context.Context, tx pgx.Tx, modName string, relName string, def types.RelationViewDefinition) error {
	columnsEx, err := getColumns_tx(ctx, tx, modName, relName)
	if err != nil {
		return err
	}
	if len(columnsEx) == 0 {
		return nil
	}

	columnNames, err := getDefinitionColumnNames_tx(ctx, tx, def)
	if err != nil {
		return err
	}
	if len(columnsEx) != len(columnNames) {
		return nil
	}

	seen := make(map[string]bool, len(columnNames))
	for _, name := range columnNames {
		if seen[name] {
			return fmt.Errorf("duplicate view definition column alias '%s'", name)
		}
		seen[name] = true
	}

	changed := make([]int, 0)
	for i, colEx := range columnsEx {
		if colEx.Name != columnNames[i] {
			changed = append(changed, i)
		}
	}
	if len(changed) == 0 {
		return nil
	}

	tempNames := make(map[int]string, len(changed))
	for _, pos := range changed {
		tempName := fmt.Sprintf("__r3_view_col_%d", pos)
		tempNames[pos] = tempName
		if _, err := tx.Exec(ctx, fmt.Sprintf(`ALTER VIEW %s.%s RENAME COLUMN %s TO %s`,
			quoteIdentifier(modName), quoteIdentifier(relName),
			quoteIdentifier(columnsEx[pos].Name), quoteIdentifier(tempName))); err != nil {

			return err
		}
	}
	for _, pos := range changed {
		if _, err := tx.Exec(ctx, fmt.Sprintf(`ALTER VIEW %s.%s RENAME COLUMN %s TO %s`,
			quoteIdentifier(modName), quoteIdentifier(relName),
			quoteIdentifier(tempNames[pos]), quoteIdentifier(columnNames[pos]))); err != nil {

			return err
		}
	}
	return nil
}

func getDefinitionColumnNames_tx(ctx context.Context, tx pgx.Tx, def types.RelationViewDefinition) ([]string, error) {
	names := make([]string, 0, len(def.Columns))
	for _, col := range def.Columns {
		name := strings.TrimSpace(col.Alias)
		if name == "" {
			atr, err := getAttributeRef_tx(ctx, tx, col.AttributeId)
			if err != nil {
				return nil, err
			}
			name = atr.Name
		}
		if err := checkIdentifier(name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, nil
}

func getDefinitionColumnExpression(col types.RelationViewDefinitionColumn, rel queryRelationRef, atr queryAttributeRef) (string, error) {
	expr := fmt.Sprintf(`"%s"."%s"`, rel.Alias, atr.Name)
	fnc := strings.ToLower(strings.TrimSpace(col.Function))

	switch fnc {
	case "":
		return expr, nil
	case "coalesce":
		fallback, err := getDefinitionFallbackLiteral(col.Fallback, atr)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("COALESCE(%s, %s)", expr, fallback), nil
	case "year", "quarter", "month", "week", "day", "dow":
		ts, err := getDefinitionTimestampExpression(expr, atr, false)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("EXTRACT(%s FROM %s)::integer", strings.ToUpper(fnc), ts), nil
	case "hour", "minute":
		if !(isDefinitionIntegerAttribute(atr) && (atr.ContentUse == "datetime" || atr.ContentUse == "time")) {
			return "", fmt.Errorf("view definition time functions require a datetime or time attribute")
		}
		ts := fmt.Sprintf("TO_TIMESTAMP(%s)", expr)
		return fmt.Sprintf("EXTRACT(%s FROM %s)::integer", strings.ToUpper(fnc), ts), nil
	case "lower":
		if !isDefinitionTextAttribute(atr) {
			return "", fmt.Errorf("view definition function LOWER requires a text attribute")
		}
		return fmt.Sprintf("LOWER(%s)", expr), nil
	case "upper":
		if !isDefinitionTextAttribute(atr) {
			return "", fmt.Errorf("view definition function UPPER requires a text attribute")
		}
		return fmt.Sprintf("UPPER(%s)", expr), nil
	case "trim":
		if !isDefinitionTextAttribute(atr) {
			return "", fmt.Errorf("view definition function TRIM requires a text attribute")
		}
		return fmt.Sprintf("TRIM(%s)", expr), nil
	case "length":
		if !isDefinitionTextAttribute(atr) {
			return "", fmt.Errorf("view definition function LENGTH requires a text attribute")
		}
		return fmt.Sprintf("LENGTH(%s)::integer", expr), nil
	case "round":
		if !isDefinitionPlainNumberAttribute(atr) {
			return "", fmt.Errorf("view definition function ROUND requires a number attribute")
		}
		return fmt.Sprintf("ROUND((%s)::numeric)", expr), nil
	case "abs":
		if !isDefinitionPlainNumberAttribute(atr) {
			return "", fmt.Errorf("view definition function ABS requires a number attribute")
		}
		return fmt.Sprintf("ABS(%s)", expr), nil
	}
	return "", fmt.Errorf("unsupported view definition function '%s'", col.Function)
}

func getDefinitionSelectExpression(expr string, aggregate string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(aggregate)) {
	case "":
		return expr, nil
	case "sum":
		return fmt.Sprintf("COALESCE(SUM(%s), 0)::numeric", expr), nil
	case "count":
		return fmt.Sprintf("COUNT(%s)::bigint", expr), nil
	case "avg":
		return fmt.Sprintf("AVG(%s)::numeric", expr), nil
	case "min":
		return fmt.Sprintf("MIN(%s)", expr), nil
	case "max":
		return fmt.Sprintf("MAX(%s)", expr), nil
	}
	return "", fmt.Errorf("unsupported view definition aggregate '%s'", aggregate)
}

func getDefinitionConditionSql(expr string, operator string, value string, atr queryAttributeRef, fnc string, aggregate string) (string, error) {
	op, err := normalizeDefinitionOperator(operator)
	if err != nil {
		return "", err
	}
	if op == "IS NULL" || op == "IS NOT NULL" {
		return fmt.Sprintf("%s %s", expr, op), nil
	}
	if op == "IN" {
		values := strings.Split(value, ",")
		literals := make([]string, 0, len(values))
		for _, part := range values {
			lit, err := getDefinitionConditionLiteral(part, atr, fnc, aggregate)
			if err != nil {
				return "", err
			}
			literals = append(literals, lit)
		}
		if len(literals) == 0 {
			return "", fmt.Errorf("view definition IN condition requires at least one value")
		}
		return fmt.Sprintf("%s IN (%s)", expr, strings.Join(literals, ", ")), nil
	}

	literal, err := getDefinitionConditionLiteral(value, atr, fnc, aggregate)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s %s %s", expr, op, literal), nil
}

func getDefinitionConditionLiteral(value string, atr queryAttributeRef, fnc string, aggregate string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("view definition condition requires a value")
	}

	fnc = strings.ToLower(strings.TrimSpace(fnc))
	aggregate = strings.ToLower(strings.TrimSpace(aggregate))

	if aggregate == "count" || aggregate == "sum" || aggregate == "avg" ||
		fnc == "year" || fnc == "quarter" || fnc == "month" || fnc == "week" ||
		fnc == "day" || fnc == "dow" || fnc == "hour" || fnc == "minute" || fnc == "length" ||
		(aggregate == "" && (isDefinitionNumberAttribute(atr) || isDefinitionRelationshipAttribute(atr) || isDefinitionDateTimeNumberAttribute(atr))) {

		if !numericLiteralRe.MatchString(value) {
			return "", fmt.Errorf("view definition condition value must be a number")
		}
		return value, nil
	}
	if atr.Content == "boolean" && fnc == "" && (aggregate == "" || aggregate == "min" || aggregate == "max") {
		valueLower := strings.ToLower(value)
		if valueLower != "true" && valueLower != "false" {
			return "", fmt.Errorf("view definition condition value must be true or false")
		}
		return valueLower, nil
	}
	return fmt.Sprintf("'%s'", strings.ReplaceAll(value, "'", "''")), nil
}

func normalizeDefinitionOperator(operator string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(operator)) {
	case "", "=", "eq":
		return "=", nil
	case "!=", "<>", "neq":
		return "<>", nil
	case ">", "gt":
		return ">", nil
	case "<", "lt":
		return "<", nil
	case ">=", "gte":
		return ">=", nil
	case "<=", "lte":
		return "<=", nil
	case "like":
		return "LIKE", nil
	case "ilike":
		return "ILIKE", nil
	case "in":
		return "IN", nil
	case "is null", "null":
		return "IS NULL", nil
	case "is not null", "not null":
		return "IS NOT NULL", nil
	}
	return "", fmt.Errorf("unsupported view definition condition operator '%s'", operator)
}

func prefixDefinitionCondition(condition string, connector string, pos int) string {
	if pos == 0 {
		return condition
	}
	if strings.ToUpper(strings.TrimSpace(connector)) == "OR" {
		return "OR " + condition
	}
	return "AND " + condition
}

func getDefinitionTimestampExpression(expr string, atr queryAttributeRef, allowTime bool) (string, error) {
	if !isDefinitionDateAttribute(atr) && (!allowTime || !(isDefinitionIntegerAttribute(atr) && atr.ContentUse == "time")) {
		return "", fmt.Errorf("view definition date/time functions require a date, datetime or time attribute")
	}
	return fmt.Sprintf("TO_TIMESTAMP(%s)", expr), nil
}

func getDefinitionFallbackLiteral(value string, atr queryAttributeRef) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("view definition COALESCE requires a fallback value")
	}

	if isDefinitionNumberAttribute(atr) || isDefinitionRelationshipAttribute(atr) || isDefinitionDateTimeNumberAttribute(atr) {
		if !numericLiteralRe.MatchString(value) {
			return "", fmt.Errorf("view definition COALESCE fallback for numeric attributes must be a number")
		}
		return value, nil
	}
	if atr.Content == "boolean" {
		valueLower := strings.ToLower(value)
		if valueLower != "true" && valueLower != "false" {
			return "", fmt.Errorf("view definition COALESCE fallback for boolean attributes must be true or false")
		}
		return valueLower, nil
	}
	if isDefinitionTextAttribute(atr) {
		return fmt.Sprintf("'%s'", strings.ReplaceAll(value, "'", "''")), nil
	}
	return "", fmt.Errorf("view definition COALESCE is not supported for attribute type '%s'", atr.Content)
}

func isDefinitionDateAttribute(atr queryAttributeRef) bool {
	return isDefinitionIntegerAttribute(atr) && (atr.ContentUse == "date" || atr.ContentUse == "datetime")
}

func isDefinitionDateTimeNumberAttribute(atr queryAttributeRef) bool {
	return isDefinitionIntegerAttribute(atr) && (atr.ContentUse == "date" || atr.ContentUse == "datetime" || atr.ContentUse == "time")
}

func isDefinitionIntegerAttribute(atr queryAttributeRef) bool {
	return atr.Content == "integer" || atr.Content == "bigint"
}

func isDefinitionNumberAttribute(atr queryAttributeRef) bool {
	return atr.Content == "integer" || atr.Content == "bigint" ||
		atr.Content == "numeric" || atr.Content == "real" || atr.Content == "double precision"
}

func isDefinitionPlainNumberAttribute(atr queryAttributeRef) bool {
	return isDefinitionNumberAttribute(atr) && atr.ContentUse == "default"
}

func isDefinitionRelationshipAttribute(atr queryAttributeRef) bool {
	return atr.Content == "1:1" || atr.Content == "n:1"
}

func isDefinitionTextAttribute(atr queryAttributeRef) bool {
	return atr.Content == "varchar" || atr.Content == "text"
}

func getPkAttribute_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID) (queryAttributeRef, error) {
	return getAttributeByRelationName_tx(ctx, tx, relationId, schema.PkName)
}

func getAttributeByRelationName_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID, name string) (queryAttributeRef, error) {
	var ref queryAttributeRef
	if err := tx.QueryRow(ctx, `
		SELECT id, relation_id, relationship_id, name, content, content_use
		FROM app.attribute
		WHERE relation_id = $1
		AND   name = $2
	`, relationId, name).Scan(&ref.Id, &ref.RelationId, &ref.RelationshipId, &ref.Name, &ref.Content, &ref.ContentUse); err != nil {
		return ref, err
	}
	return ref, nil
}

func getAttributeRef_tx(ctx context.Context, tx pgx.Tx, attributeId uuid.UUID) (queryAttributeRef, error) {
	var ref queryAttributeRef
	if err := tx.QueryRow(ctx, `
		SELECT id, relation_id, relationship_id, name, content, content_use
		FROM app.attribute
		WHERE id = $1
	`, attributeId).Scan(&ref.Id, &ref.RelationId, &ref.RelationshipId, &ref.Name, &ref.Content, &ref.ContentUse); err != nil {
		return ref, err
	}
	return ref, nil
}

func checkIdentifier(name string) error {
	if !regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`).MatchString(name) {
		return fmt.Errorf("invalid view definition column alias '%s'", name)
	}
	return nil
}

func quoteIdentifier(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func resolveToken_tx(ctx context.Context, tx pgx.Tx, kind string, value string) (string, string, []viewDependency, error) {
	switch kind {
	case "REL", "RELID":
		id, modId, modName, relName, err := resolveRelationToken_tx(ctx, tx, kind, value)
		if err != nil {
			return "", "", nil, err
		}
		return fmt.Sprintf(`"%s"."%s"`, modName, relName),
			fmt.Sprintf("{RELID:%s}", id),
			[]viewDependency{
				{Entity: string(schema.DbModule), Id: modId},
				{Entity: string(schema.DbRelation), Id: id},
			}, nil

	case "ATR", "ATRID":
		id, modId, relId, atrName, err := resolveAttributeToken_tx(ctx, tx, kind, value)
		if err != nil {
			return "", "", nil, err
		}
		return fmt.Sprintf(`"%s"`, atrName),
			fmt.Sprintf("{ATRID:%s}", id),
			[]viewDependency{
				{Entity: string(schema.DbModule), Id: modId},
				{Entity: string(schema.DbRelation), Id: relId},
				{Entity: string(schema.DbAttribute), Id: id},
			}, nil

	case "PGF", "PGFID":
		id, modId, modName, fncName, err := resolvePgFunctionToken_tx(ctx, tx, kind, value)
		if err != nil {
			return "", "", nil, err
		}
		return fmt.Sprintf(`"%s"."%s"`, modName, fncName),
			fmt.Sprintf("{PGFID:%s}", id),
			[]viewDependency{
				{Entity: string(schema.DbModule), Id: modId},
				{Entity: string(schema.DbPgFunction), Id: id},
			}, nil
	}
	return "", "", nil, fmt.Errorf("unknown view SQL token '%s'", kind)
}

func resolveRelationToken_tx(ctx context.Context, tx pgx.Tx, kind string, value string) (uuid.UUID, uuid.UUID, string, string, error) {
	if kind == "RELID" {
		id, err := uuid.FromString(value)
		if err != nil {
			return uuid.Nil, uuid.Nil, "", "", err
		}
		var modId uuid.UUID
		var modName, relName string
		err = tx.QueryRow(ctx, `
			SELECT m.id, m.name, r.name
			FROM app.relation AS r
			JOIN app.module AS m ON m.id = r.module_id
			WHERE r.id = $1
		`, id).Scan(&modId, &modName, &relName)
		return id, modId, modName, relName, err
	}

	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return uuid.Nil, uuid.Nil, "", "", fmt.Errorf("relation token must be {REL:module.relation}")
	}

	var id uuid.UUID
	var modId uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT r.id, m.id
		FROM app.relation AS r
		JOIN app.module AS m ON m.id = r.module_id
		WHERE m.name = $1
		AND   r.name = $2
	`, parts[0], parts[1]).Scan(&id, &modId); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, uuid.Nil, "", "", fmt.Errorf("relation token not found: {REL:%s}", value)
		}
		return uuid.Nil, uuid.Nil, "", "", err
	}
	return id, modId, parts[0], parts[1], nil
}

func resolveAttributeToken_tx(ctx context.Context, tx pgx.Tx, kind string, value string) (uuid.UUID, uuid.UUID, uuid.UUID, string, error) {
	if kind == "ATRID" {
		id, err := uuid.FromString(value)
		if err != nil {
			return uuid.Nil, uuid.Nil, uuid.Nil, "", err
		}
		var modId uuid.UUID
		var relId uuid.UUID
		var name string
		err = tx.QueryRow(ctx, `
			SELECT m.id, r.id, a.name
			FROM app.attribute AS a
			JOIN app.relation  AS r ON r.id = a.relation_id
			JOIN app.module    AS m ON m.id = r.module_id
			WHERE a.id = $1
		`, id).Scan(&modId, &relId, &name)
		return id, modId, relId, name, err
	}

	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return uuid.Nil, uuid.Nil, uuid.Nil, "", fmt.Errorf("attribute token must be {ATR:module.relation.attribute}")
	}

	var id uuid.UUID
	var modId uuid.UUID
	var relId uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT a.id, m.id, r.id
		FROM app.attribute AS a
		JOIN app.relation  AS r ON r.id = a.relation_id
		JOIN app.module    AS m ON m.id = r.module_id
		WHERE m.name = $1
		AND   r.name = $2
		AND   a.name = $3
	`, parts[0], parts[1], parts[2]).Scan(&id, &modId, &relId); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, uuid.Nil, uuid.Nil, "", fmt.Errorf("attribute token not found: {ATR:%s}", value)
		}
		return uuid.Nil, uuid.Nil, uuid.Nil, "", err
	}
	return id, modId, relId, parts[2], nil
}

func resolvePgFunctionToken_tx(ctx context.Context, tx pgx.Tx, kind string, value string) (uuid.UUID, uuid.UUID, string, string, error) {
	if kind == "PGFID" {
		id, err := uuid.FromString(value)
		if err != nil {
			return uuid.Nil, uuid.Nil, "", "", err
		}
		var modId uuid.UUID
		var modName, fncName string
		err = tx.QueryRow(ctx, `
			SELECT m.id, m.name, f.name
			FROM app.pg_function AS f
			JOIN app.module AS m ON m.id = f.module_id
			WHERE f.id = $1
		`, id).Scan(&modId, &modName, &fncName)
		return id, modId, modName, fncName, err
	}

	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return uuid.Nil, uuid.Nil, "", "", fmt.Errorf("PG function token must be {PGF:module.function}")
	}

	var id uuid.UUID
	var modId uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT f.id, m.id
		FROM app.pg_function AS f
		JOIN app.module AS m ON m.id = f.module_id
		WHERE m.name = $1
		AND   f.name = $2
	`, parts[0], parts[1]).Scan(&id, &modId); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, uuid.Nil, "", "", fmt.Errorf("PG function token not found: {PGF:%s}", value)
		}
		return uuid.Nil, uuid.Nil, "", "", err
	}
	return id, modId, parts[0], parts[1], nil
}

func setDependencies_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID, dependencies []viewDependency) error {
	if _, err := tx.Exec(ctx, `DELETE FROM app.relation_view_depends WHERE relation_id = $1`, relationId); err != nil {
		return err
	}
	for _, dep := range dependencies {
		if _, err := tx.Exec(ctx, `
			INSERT INTO app.relation_view_depends (relation_id, entity, entity_id)
			VALUES ($1,$2,$3)
			ON CONFLICT DO NOTHING
		`, relationId, dep.Entity, dep.Id); err != nil {
			return err
		}
	}
	return nil
}

func getRelation_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID) (types.Relation, error) {
	var rel types.Relation
	if err := tx.QueryRow(ctx, `
		SELECT id, module_id, name, comment, encryption, retention_count, retention_days
		FROM app.relation
		WHERE id = $1
	`, relationId).Scan(&rel.Id, &rel.ModuleId, &rel.Name, &rel.Comment,
		&rel.Encryption, &rel.RetentionCount, &rel.RetentionDays); err != nil {

		return rel, err
	}
	view, err := Get_tx(ctx, tx, relationId)
	if err != nil {
		return rel, err
	}
	rel.View = view
	return rel, nil
}

func Del_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID) error {
	v, err := Get_tx(ctx, tx, relationId)
	if err != nil || v == nil {
		return err
	}
	if !v.Managed {
		return nil
	}

	modName, relName, err := schema.GetRelationNamesById_tx(ctx, tx, relationId)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, fmt.Sprintf(`DROP VIEW IF EXISTS "%s"."%s" CASCADE`, modName, relName))
	return err
}

func SyncAttributes_tx(ctx context.Context, tx pgx.Tx, relationId uuid.UUID) error {
	modName, relName, err := schema.GetRelationNamesById_tx(ctx, tx, relationId)
	if err != nil {
		return err
	}

	columns, err := getColumns_tx(ctx, tx, modName, relName)
	if err != nil {
		return err
	}

	existing := make(map[string]types.Attribute)
	rows, err := tx.Query(ctx, `
		SELECT id, name
		FROM app.attribute
		WHERE relation_id = $1
	`, relationId)
	if err != nil {
		return err
	}
	for rows.Next() {
		var atr types.Attribute
		if err := rows.Scan(&atr.Id, &atr.Name); err != nil {
			rows.Close()
			return err
		}
		existing[atr.Name] = atr
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	seen := make(map[string]bool)
	for _, col := range columns {
		seen[col.Name] = true
		atr, known := existing[col.Name]
		if !known {
			id, err := uuid.NewV4()
			if err != nil {
				return err
			}
			atr.Id = id
		}

		if known {
			if _, err := tx.Exec(ctx, `
				UPDATE app.attribute
				SET content = $1, content_use = 'default', length = $2, length_fract = $3,
					nullable = $4, encrypted = false, def = '', on_update = NULL, on_delete = NULL,
					relationship_id = NULL
				WHERE id = $5
			`, col.Content, col.Length, col.LengthFract, col.Nullable, atr.Id); err != nil {
				return err
			}
		} else if _, err := tx.Exec(ctx, `
			INSERT INTO app.attribute (id, relation_id, relationship_id,
				icon_id, name, content, content_use, length, length_fract,
				nullable, encrypted, def, on_update, on_delete)
			VALUES ($1,$2,$3,$4,$5,$6,'default',$7,$8,$9,false,'',NULL,NULL)
		`, atr.Id, relationId, pgtype.UUID{}, pgtype.UUID{}, col.Name, col.Content,
			col.Length, col.LengthFract, col.Nullable); err != nil {

			return err
		}
	}

	for name, atr := range existing {
		if seen[name] {
			continue
		}
		if _, err := tx.Exec(ctx, `DELETE FROM app.attribute WHERE id = $1`, atr.Id); err != nil {
			return err
		}
	}
	return nil
}

func getColumns_tx(ctx context.Context, tx pgx.Tx, modName string, relName string) ([]viewColumn, error) {
	rows, err := tx.Query(ctx, `
		SELECT column_name, data_type, udt_name, COALESCE(character_maximum_length,0),
			COALESCE(numeric_precision,0), COALESCE(numeric_scale,0),
			is_nullable = 'YES'
		FROM information_schema.columns
		WHERE table_schema = $1
		AND   table_name   = $2
		ORDER BY ordinal_position ASC
	`, modName, relName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := make([]viewColumn, 0)
	for rows.Next() {
		var name string
		var dataType string
		var udtName string
		var charLength int
		var numericPrecision int
		var numericScale int
		var nullable bool

		if err := rows.Scan(&name, &dataType, &udtName, &charLength, &numericPrecision, &numericScale, &nullable); err != nil {
			return nil, err
		}

		col := viewColumn{Name: name, Nullable: nullable}
		switch dataType {
		case "integer", "bigint", "real", "double precision", "text", "boolean", "uuid":
			col.Content = dataType
		case "numeric":
			col.Content = dataType
			col.Length = numericPrecision
			col.LengthFract = numericScale
		case "character varying":
			col.Content = "varchar"
			col.Length = charLength
		case "USER-DEFINED":
			if udtName != "regconfig" {
				return nil, fmt.Errorf("unsupported view column type '%s' for column '%s'", udtName, name)
			}
			col.Content = "regconfig"
		default:
			return nil, fmt.Errorf("unsupported view column type '%s' for column '%s'", dataType, name)
		}
		columns = append(columns, col)
	}
	return columns, rows.Err()
}
