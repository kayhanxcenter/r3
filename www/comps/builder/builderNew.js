import {getDependentModules} from '../shared/builder.js';
import MyBuilderFormInput    from './builderFormInput.js';
import MyCodeEditor          from '../codeEditor.js';
import {
	getTemplateApi,
	getTemplateCollection,
	getTemplateDoc,
	getTemplateForm,
	getTemplateJsFunction,
	getTemplateModule,
	getTemplatePgFunction,
	getTemplateRelation,
	getTemplateRole,
	getTemplateSearchBar,
	getTemplateVariable,
	getTemplateWidget
} from '../shared/builderTemplate.js';

export default {
	name:'my-builder-new',
	components:{ MyBuilderFormInput, MyCodeEditor },
	template:`<div class="app-sub-window under-header" @mousedown.self="$emit('close')">
		<div class="contentBox builder-new float">
			<div class="top lower">
				<div class="area nowrap">
					<img class="icon" :src="titleImgSrc" />
					<h1 class="title">{{ title }}</h1>
				</div>
				<div class="area">
					<my-button image="cancel.png"
						@trigger="$emit('close')"
						:cancel="true"
					/>
				</div>
			</div>
			
			<div class="content gap default-inputs">
				<div class="row gap centered">
					<span>{{ capGen.name }}</span>
					<input spellcheck="false" v-model="inputs.name" v-focus />
				</div>
				
				<div
					v-if="typeof capApp.message[entity] !== 'undefined'"
					v-html="capApp.message[entity]"
				></div>
				
				<!-- additional options -->
				<div class="options" v-if="showOptions">
					<h2>{{ capApp.options }}</h2>
					
					<!-- doc: duplicate document -->
					<template v-if="entity === 'doc'">
						<div class="row centered gap">
							<span>{{ capApp.docIdDuplicate }}</span>
							<select v-model="inputs.docIdDuplicate">
								<option value="">-</option>
								<option v-for="d in module.docs" :value="d.id">{{ d.name }}</option>
								<optgroup
									v-for="mod in getDependentModules(module).filter(v => v.id !== module.id && v.docs.length !== 0)"
									:label="mod.name"
								>
									<option v-for="d in mod.docs" :value="d.id">{{ d.name }}</option>
								</optgroup>
							</select>
						</div>
					</template>
					
					<!-- form: duplicate form -->
					<template v-if="entity === 'form'">
						<div class="row centered gap">
							<span>{{ capApp.formIdDuplicate }}</span>
							<my-builder-form-input
								v-model="inputs.formIdDuplicate"
								:module="module"
							/>
						</div>
					</template>
					
					<!-- JS function: assigned form -->
					<template v-if="entity === 'jsFunction'">
						<div class="row centered gap">
							<span>{{ capApp.jsFunctionFormId }}</span>
							<select v-model="inputs.formId">
								<option :value="null">-</option>
								<option v-for="f in module.forms" :value="f.id">{{ f.name }}</option>
							</select>
						</div>
						<p v-html="capApp.jsFunctionFormIdHint"></p>
					</template>
					
					<!-- variable: assigned form -->
					<template v-if="entity === 'variable'">
						<div class="row centered gap">
							<span>{{ capApp.variableFormId }}</span>
							<select v-model="inputs.formId">
								<option :value="null">-</option>
								<option v-for="f in module.forms" :value="f.id">{{ f.name }}</option>
							</select>
						</div>
						<p v-html="capApp.variableFormIdHint"></p>
					</template>
					
					<!-- PG function: trigger/function template -->
					<template v-if="entity === 'pgFunction'">
						<div class="row centered gap">
							<span>{{ capApp.pgFunctionTemplate }}</span>
							<select v-model="inputs.template">
								<option value="">-</option>
								<option value="mailsFromSpooler">{{ capApp.template.mailsFromSpooler }}</option>
								<option value="loginSync">{{ capApp.template.loginSync }}</option>
								<option value="restAuthRequest">{{ capApp.template.restAuthRequest }}</option>
								<option value="restAuthResponse">{{ capApp.template.restAuthResponse }}</option>
								<option value="restDataResponse">{{ capApp.template.restDataResponse }}</option>
								<option value="restFileUploadToREI3">{{ capApp.template.restFileUploadToREI3 }}</option>
								<option value="restFileAttachViaREI3API">{{ capApp.template.restFileAttachViaREI3API }}</option>
							</select>
						</div>
						<hr />
						
						<div class="row centered">
							<span>{{ capApp.pgFunctionTrigger }}</span>
							<my-bool v-model="inputs.isTrigger" />
						</div>
						<p v-html="capApp.pgFunctionTriggerHint"></p>
					</template>
					
					<!-- relation: E2EE encryption -->
					<template v-if="entity === 'relation'">
						<div class="view-options">
							<div class="view-option">
								<span>PostgreSQL view</span>
								<my-bool v-model="inputs.view" />
							</div>
							<div class="view-option" v-if="!inputs.view">
								<span>{{ capApp.relationEncryption }}</span>
								<my-bool v-model="inputs.encryption" />
							</div>
						</div>
						<p v-if="!inputs.view" v-html="capApp.relationEncryptionHint"></p>
						<template v-if="inputs.view">
							<div class="view-options view-options-nested">
								<div class="view-option">
									<span>Has stable id column</span>
									<my-bool v-model="inputs.viewHasId" />
								</div>
								<div class="view-option">
									<span>Managed SQL</span>
									<my-bool v-model="inputs.viewManaged" />
								</div>
							</div>
							<div class="view-mode" v-if="inputs.viewManaged">
								<span>Definition</span>
								<select v-model="inputs.viewMode">
									<option value="definition">Generated view</option>
									<option value="sql">Advanced SQL</option>
								</select>
							</div>
							<div class="view-query-designer" v-if="inputs.viewManaged && inputs.viewMode === 'definition'">
								<div class="view-definition-row">
									<span>Base relation</span>
									<select v-model="inputs.viewQueryBaseRelationId">
										<option v-for="r in module.relations" :value="r.id">{{ r.name }}</option>
									</select>
								</div>
								<div class="view-definition-section">
									<div class="view-definition-header">
										<span>Joins</span>
										<my-button image="add.png"
											@trigger="addViewDefinitionJoin"
											:active="viewDefinitionCanAddJoin"
											:captionTitle="'Add join'"
										/>
									</div>
									<div class="view-definition-list">
										<div class="view-definition-item" v-for="(join,i) in inputs.viewDefinitionJoins">
											<select v-model="join.relationId" @change="resetViewDefinitionJoin(i)">
												<option v-for="r in viewDefinitionJoinRelations(i)" :value="r.id">{{ r.name }}</option>
											</select>
											<select v-model="join.attributeId">
												<option v-for="a in viewDefinitionJoinAttributes(join,i)" :value="a.id">{{ viewDefinitionJoinAttributeLabel(a) }}</option>
											</select>
											<div class="view-definition-check">
												<span>Required</span>
												<my-bool v-model="join.required" />
											</div>
											<my-button image="delete.png"
												@trigger="removeViewDefinitionJoin(i)"
												:captionTitle="'Remove join'"
											/>
										</div>
									</div>
								</div>
								<div class="view-definition-section">
									<div class="view-definition-header">
										<span>Columns</span>
										<my-button image="add.png"
											@trigger="addViewDefinitionColumn"
											:active="viewDefinitionCanAddColumn"
											:captionTitle="'Add column'"
										/>
									</div>
									<div class="view-definition-list">
										<div class="view-definition-item column" v-for="(column,i) in inputs.viewDefinitionColumns">
											<select v-model="column.relationId" @change="resetViewDefinitionColumn(i)">
												<option v-for="r in viewDefinitionColumnRelations" :value="r.id">{{ r.name }}</option>
											</select>
											<select v-model="column.attributeId" @change="fillViewDefinitionColumnAlias(column)">
												<option v-for="a in viewDefinitionColumnAttributes(column)" :value="a.id">{{ a.name }}</option>
											</select>
											<select v-model="column.function" @change="viewDefinitionColumnFunctionChanged(column)">
												<option v-for="f in viewDefinitionColumnFunctions(column)" :value="f.value">{{ f.label }}</option>
											</select>
											<select v-model="column.aggregate" @change="fillViewDefinitionColumnAlias(column)">
												<option value="">Value</option>
												<option value="sum">SUM</option>
												<option value="count">COUNT</option>
												<option value="avg">AVG</option>
												<option value="min">MIN</option>
												<option value="max">MAX</option>
											</select>
											<input v-model="column.fallback" :disabled="column.function !== 'coalesce'" placeholder="fallback" />
											<input v-model="column.alias" placeholder="alias" />
											<my-button image="delete.png"
												@trigger="removeViewDefinitionColumn(i)"
												:captionTitle="'Remove column'"
											/>
										</div>
									</div>
								</div>
								<div class="view-definition-section">
									<div class="view-definition-header">
										<span>Filters</span>
										<my-button image="add.png"
											@trigger="addViewDefinitionFilter"
											:active="viewDefinitionCanAddFilter"
											:captionTitle="'Add filter'"
										/>
									</div>
									<div class="view-definition-list">
										<div class="view-definition-item condition" v-for="(filter,i) in inputs.viewDefinitionFilters">
											<select v-model="filter.connector" :disabled="i === 0">
												<option value="AND">AND</option>
												<option value="OR">OR</option>
											</select>
											<select v-model="filter.relationId" @change="resetViewDefinitionFilter(i)">
												<option v-for="r in viewDefinitionColumnRelations" :value="r.id">{{ r.name }}</option>
											</select>
											<select v-model="filter.attributeId" @change="viewDefinitionColumnFunctionChanged(filter)">
												<option v-for="a in viewDefinitionColumnAttributes(filter)" :value="a.id">{{ a.name }}</option>
											</select>
											<select v-model="filter.function" @change="viewDefinitionColumnFunctionChanged(filter)">
												<option v-for="f in viewDefinitionColumnFunctions(filter)" :value="f.value">{{ f.label }}</option>
											</select>
											<select v-model="filter.operator">
												<option v-for="o in viewDefinitionConditionOperators" :value="o.value">{{ o.label }}</option>
											</select>
											<input v-model="filter.value" :disabled="viewDefinitionOperatorNeedsNoValue(filter.operator)" placeholder="value" />
											<input v-model="filter.fallback" :disabled="filter.function !== 'coalesce'" placeholder="fallback" />
											<my-button image="delete.png"
												@trigger="removeViewDefinitionFilter(i)"
												:captionTitle="'Remove filter'"
											/>
										</div>
									</div>
								</div>
								<div class="view-definition-section">
									<div class="view-definition-header">
										<span>Having</span>
										<my-button image="add.png"
											@trigger="addViewDefinitionHaving"
											:active="viewDefinitionCanAddHaving"
											:captionTitle="'Add having condition'"
										/>
									</div>
									<div class="view-definition-list">
										<div class="view-definition-item having" v-for="(having,i) in inputs.viewDefinitionHavings">
											<select v-model="having.connector" :disabled="i === 0">
												<option value="AND">AND</option>
												<option value="OR">OR</option>
											</select>
											<select v-model="having.columnAlias">
												<option v-for="c in viewDefinitionOutputColumns" :value="c.alias">{{ c.alias }}</option>
											</select>
											<select v-model="having.operator">
												<option v-for="o in viewDefinitionConditionOperators" :value="o.value">{{ o.label }}</option>
											</select>
											<input v-model="having.value" :disabled="viewDefinitionOperatorNeedsNoValue(having.operator)" placeholder="value" />
											<my-button image="delete.png"
												@trigger="removeViewDefinitionHaving(i)"
												:captionTitle="'Remove having condition'"
											/>
										</div>
									</div>
								</div>
								<div class="view-definition-section">
									<div class="view-definition-header">
										<span>Order</span>
										<my-button image="add.png"
											@trigger="addViewDefinitionOrder"
											:active="viewDefinitionCanAddOrder"
											:captionTitle="'Add order'"
										/>
									</div>
									<div class="view-definition-list">
										<div class="view-definition-item order" v-for="(order,i) in inputs.viewDefinitionOrders">
											<select v-model="order.columnAlias">
												<option v-for="c in viewDefinitionOutputColumns" :value="c.alias">{{ c.alias }}</option>
											</select>
											<select v-model="order.direction">
												<option value="ASC">ASC</option>
												<option value="DESC">DESC</option>
											</select>
											<my-button image="delete.png"
												@trigger="removeViewDefinitionOrder(i)"
												:captionTitle="'Remove order'"
											/>
										</div>
									</div>
								</div>
							</div>
							<div class="view-token-picker" v-if="inputs.viewManaged && inputs.viewMode === 'sql'">
								<select v-model="viewTokenKind">
									<option value="REL">Relation</option>
									<option value="ATR">Attribute</option>
									<option value="PGF">PG function</option>
								</select>
								<select v-model="viewTokenModuleId">
									<option v-for="m in modules" :value="m.id">{{ m.name }}</option>
								</select>
								<select v-if="['REL','ATR'].includes(viewTokenKind)" v-model="viewTokenRelationId">
									<option v-for="r in viewTokenRelations" :value="r.id">{{ r.name }}</option>
								</select>
								<select v-if="viewTokenKind === 'ATR'" v-model="viewTokenAttributeId">
									<option v-for="a in viewTokenAttributes" :value="a.id">{{ a.name }}</option>
								</select>
								<select v-if="viewTokenKind === 'PGF'" v-model="viewTokenPgFunctionId">
									<option v-for="f in viewTokenPgFunctions" :value="f.id">{{ f.name }}</option>
								</select>
								<my-button image="add.png"
									@trigger="appendPickedViewSqlToken"
									:active="viewTokenCanInsert"
									:captionTitle="'Insert token'"
								/>
							</div>
							<div class="view-token-preview" v-if="viewTokenPreview !== ''">
								{{ viewTokenPreview }}
							</div>
							<div class="view-sql-editor" v-if="inputs.viewManaged && inputs.viewMode === 'sql'">
								<my-code-editor
									v-model="inputs.viewSql"
									mode="pgsql"
								/>
							</div>
						</template>
					</template>
				</div>
				
				<p class="error" v-if="nameTaken">{{ capGen.error.nameTaken }}</p>
				<p class="error" v-if="nameTooLong">{{ capGen.error.nameTooLong.replace('{LEN}',nameMaxLength) }}</p>
				
				<div class="row">
					<my-button image="save.png"
						@trigger="set"
						:active="canSave"
						:caption="capGen.button.create"
					/>
				</div>
			</div>
		</div>
	</div>`,
	props:{
		builderLanguage:{ type:String, required:true },
		entity:         { type:String, required:true },
		moduleId:       { type:String, required:true },
		presets:        { type:Object, required:true } // preset values for inputs
	},
	emits:['close'],
	data() {
		return {
			inputs:{
				// all
				name:'',

				// doc
				docIdDuplicate:'',
				
				// form
				formIdDuplicate:null,
				
				// JS function
				formId:null,
				
				// PG function
				isTrigger:false,
				template:'',
				
				// relation
				encryption:false,
				view:false,
				viewHasId:true,
				viewManaged:true,
				viewMode:'definition',
				viewSql:'',
				viewQueryBaseRelationId:'',
				viewDefinitionJoins:[],
				viewDefinitionColumns:[],
				viewDefinitionFilters:[],
				viewDefinitionHavings:[],
				viewDefinitionOrders:[]
			},
			viewTokenAttributeId:'',
			viewTokenKind:'REL',
			viewTokenModuleId:'',
			viewTokenPgFunctionId:'',
			viewTokenRelationId:''
		};
	},
	watch:{
		viewTokenKind() {
			this.resetViewTokenPicker();
		},
		viewTokenModuleId() {
			this.viewTokenRelationId   = '';
			this.viewTokenAttributeId  = '';
			this.viewTokenPgFunctionId = '';
			this.resetViewTokenPicker();
		},
		viewTokenRelationId() {
			this.viewTokenAttributeId = '';
			this.resetViewTokenPicker();
		},
		'inputs.viewQueryBaseRelationId'() {
			this.resetViewQueryDesigner();
		}
	},
	computed:{
		nameMaxLength:(s) => {
			switch(s.entity) {
				case 'api':        return 60; break;
				case 'collection': return 64; break;
				case 'doc':        return 64; break;
				case 'form':       return 64; break;
				case 'jsFunction': return 64; break;
				case 'module':     return 60; break;
				case 'pgFunction': return 60; break;
				case 'relation':   return 60; break;
				case 'role':       return 64; break;
				case 'searchBar':  return 64; break;
				case 'variable':   return 64; break;
				case 'widget':     return 64; break;
			}
			return 0;
		},
		nameTaken:(s) => {
			if(s.inputs.name === '')
				return false;
			
			let searchList;
			switch(s.entity) {
				case 'module':     searchList = s.modules;            break;
				case 'api':        searchList = s.module.apis;        break;
				case 'collection': searchList = s.module.collections; break;
				case 'doc':        searchList = s.module.docs;        break;
				case 'form':       searchList = s.module.forms;       break;
				case 'jsFunction': searchList = s.module.jsFunctions; break;
				case 'pgFunction': searchList = s.module.pgFunctions; break;
				case 'relation':   searchList = s.module.relations;   break;
				case 'role':       searchList = s.module.roles;       break;
				case 'searchBar':  searchList = s.module.searchBars;  break;
				case 'variable':   searchList = s.module.variables;   break;
				case 'widget':     searchList = s.module.widgets;     break;
			}
			for(let e of searchList) {
				// only compare names of functions within the same scope (global or form)
				if(s.entity === 'jsFunction' && e.formId !== s.inputs.formId)
					continue;

				// only compare names of variables within the same scope (global or form)
				if(s.entity === 'variable' && e.formId !== s.inputs.formId)
					continue;
				
				if(e.name === s.inputs.name)
					return true;
			}
			return false;
		},
		
		// presentation
		title:(s) => {
			switch(s.entity) {
				case 'api':        return s.capApp.api;        break;
				case 'collection': return s.capApp.collection; break;
				case 'doc':        return s.capApp.doc;        break;
				case 'form':       return s.capApp.form;       break;
				case 'jsFunction': return s.capApp.jsFunction; break;
				case 'module':     return s.capApp.module;     break;
				case 'pgFunction': return s.capApp.pgFunction; break;
				case 'relation':   return s.capApp.relation;   break;
				case 'role':       return s.capApp.role;       break;
				case 'searchBar':  return s.capApp.searchBar;  break;
				case 'variable':   return s.capApp.variable;   break;
				case 'widget':     return s.capApp.widget;     break;
			}
			return '';
		},
		titleImgSrc:(s) => {
			switch(s.entity) {
				case 'api':        return 'images/api.png';            break;
				case 'collection': return 'images/tray.png';           break;
				case 'doc':        return 'images/document.png';       break;
				case 'form':       return 'images/fileText.png';       break;
				case 'jsFunction': return 'images/codeScreen.png';     break;
				case 'module':     return 'images/module.png';         break;
				case 'pgFunction': return 'images/codeDatabase.png';   break;
				case 'relation':   return 'images/database.png';       break;
				case 'role':       return 'images/personMultiple.png'; break;
				case 'searchBar':  return 'images/search.png';         break;
				case 'variable':   return 'images/variable.png';       break;
				case 'widget':     return 'images/tiles.png';          break;
			}
			return '';
		},

		// simple
		canSave:    (s) => s.inputs.name !== '' && !s.nameTaken && !s.nameTooLong && (!s.inputs.view || !s.inputs.viewManaged || (s.inputs.viewMode === 'definition' ? s.viewDefinitionValid : s.inputs.viewSql !== '')),
		nameTooLong:(s) => s.inputs.name !== '' && s.inputs.name.length > s.nameMaxLength,
		showOptions:(s) => ['doc','form','jsFunction','pgFunction','relation','variable'].includes(s.entity),
		viewTokenAttributes:s => {
			if(s.viewTokenRelationId === '' || s.module === undefined)
				return [];

			const rel = s.moduleIdMap[s.viewTokenModuleId].relations.find(v => v.id === s.viewTokenRelationId);
			return rel === undefined ? [] : rel.attributes;
		},
		viewTokenCanInsert:s => {
			if(s.viewTokenKind === 'REL')
				return s.viewTokenRelationId !== '';
			if(s.viewTokenKind === 'ATR')
				return s.viewTokenAttributeId !== '';
			if(s.viewTokenKind === 'PGF')
				return s.viewTokenPgFunctionId !== '';
			return false;
		},
		viewTokenModule:s => s.viewTokenModuleId === '' || s.moduleIdMap[s.viewTokenModuleId] === undefined
			? false : s.moduleIdMap[s.viewTokenModuleId],
		viewTokenPgFunctions:s => s.viewTokenModule === false ? [] : s.viewTokenModule.pgFunctions,
		viewTokenPreview:s => {
			if(!s.viewTokenCanInsert)
				return '';
			return s.getPickedViewSqlToken();
		},
		viewTokenRelations:s => s.viewTokenModule === false ? [] : s.viewTokenModule.relations,
		viewQueryBaseRelation:s => s.relationIdByInput(s.inputs.viewQueryBaseRelationId),
		viewQueryBaseAttributes:s => s.viewQueryBaseRelation === false ? [] : s.viewQueryBaseRelation.attributes,
		viewDefinitionCanAddColumn:s => s.viewDefinitionColumnRelations.length !== 0,
		viewDefinitionCanAddFilter:s => s.viewDefinitionColumnRelations.length !== 0,
		viewDefinitionCanAddHaving:s => s.viewDefinitionOutputColumns.length !== 0,
		viewDefinitionCanAddJoin:s => s.viewDefinitionJoinRelations(s.inputs.viewDefinitionJoins.length).length !== 0,
		viewDefinitionCanAddOrder:s => s.viewDefinitionOutputColumns.length !== 0,
		viewDefinitionColumnRelations:s => {
			const out = [];
			const base = s.viewQueryBaseRelation;
			if(base !== false)
				out.push(base);
			for(const join of s.inputs.viewDefinitionJoins) {
				const rel = s.relationIdByInput(join.relationId);
				if(rel !== false && !out.some(r => r.id === rel.id))
					out.push(rel);
			}
			return out;
		},
		viewDefinitionConditionOperators:() => [
			{ value:'=', label:'=' },
			{ value:'<>', label:'!=' },
			{ value:'>', label:'>' },
			{ value:'<', label:'<' },
			{ value:'>=', label:'>=' },
			{ value:'<=', label:'<=' },
			{ value:'LIKE', label:'LIKE' },
			{ value:'ILIKE', label:'ILIKE' },
			{ value:'IN', label:'IN' },
			{ value:'IS NULL', label:'IS NULL' },
			{ value:'IS NOT NULL', label:'IS NOT NULL' }
		],
		viewDefinitionOutputColumns:s => s.inputs.viewDefinitionColumns.filter(c => c.alias !== '').map(c => ({ alias:c.alias })),
		viewDefinitionValid:s => s.inputs.viewQueryBaseRelationId !== ''
			&& s.inputs.viewDefinitionColumns.length !== 0
			&& s.inputs.viewDefinitionJoins.every(j => j.relationId !== '' && j.attributeId !== '')
			&& s.inputs.viewDefinitionColumns.every(c => c.relationId !== '' && c.attributeId !== '' && c.alias !== '' && (c.function !== 'coalesce' || c.fallback !== ''))
			&& s.inputs.viewDefinitionFilters.every(f => f.relationId !== '' && f.attributeId !== '' && f.operator !== '' && (s.viewDefinitionOperatorNeedsNoValue(f.operator) || f.value !== '') && (f.function !== 'coalesce' || f.fallback !== ''))
			&& s.inputs.viewDefinitionHavings.every(h => h.columnAlias !== '' && h.operator !== '' && (s.viewDefinitionOperatorNeedsNoValue(h.operator) || h.value !== ''))
			&& s.inputs.viewDefinitionOrders.every(o => o.columnAlias !== '' && ['ASC','DESC'].includes(o.direction)),
		
		// stores
		module:     (s) => s.moduleIdMap[s.moduleId],
		modules:    (s) => s.$store.getters['schema/modules'],
		moduleIdMap:(s) => s.$store.getters['schema/moduleIdMap'],
		capApp:     (s) => s.$store.getters.captions.builder.new,
		capGen:     (s) => s.$store.getters.captions.generic
	},
	mounted() {
		// apply preset input values
		for(let k in this.inputs) {
			if(typeof this.presets[k] !== 'undefined')
				this.inputs[k] = this.presets[k];
		}
		this.resetViewTokenPicker();
		this.resetViewQueryDesigner();
		
		this.$store.commit('keyDownHandlerSleep');
		this.$store.commit('keyDownHandlerAdd',{fnc:this.set,key:'s',keyCtrl:true});
		this.$store.commit('keyDownHandlerAdd',{fnc:this.close,key:'Escape'});
	},
	unmounted() {
		this.$store.commit('keyDownHandlerDel',this.set);
		this.$store.commit('keyDownHandlerDel',this.close);
		this.$store.commit('keyDownHandlerWake');
	},
	methods:{
		// externals
		getDependentModules,
		getTemplateApi,
		getTemplateCollection,
		getTemplateDoc,
		getTemplateForm,
		getTemplateJsFunction,
		getTemplateModule,
		getTemplatePgFunction,
		getTemplateRelation,
		getTemplateRole,
		getTemplateSearchBar,
		getTemplateVariable,
		getTemplateWidget,
		
		// actions
		close() { this.$emit('close'); },
		appendPickedViewSqlToken() {
			const token = this.getPickedViewSqlToken();
			if(token !== '')
				this.appendViewSqlToken(token);
		},
		buildRelationViewDefinition() {
			return {
				baseRelationId:this.inputs.viewQueryBaseRelationId,
				joins:this.inputs.viewDefinitionJoins.map(j => ({
					relationId:j.relationId,
					attributeId:j.attributeId,
					required:j.required
				})),
				columns:this.inputs.viewDefinitionColumns.map(c => ({
					relationId:c.relationId,
					attributeId:c.attributeId,
					alias:c.alias,
					aggregate:c.aggregate,
					function:c.function,
					fallback:c.fallback
				})),
				filters:this.inputs.viewDefinitionFilters.map(f => ({
					connector:f.connector,
					relationId:f.relationId,
					attributeId:f.attributeId,
					function:f.function,
					fallback:f.fallback,
					operator:f.operator,
					value:f.value
				})),
				havings:this.inputs.viewDefinitionHavings.map(h => ({
					connector:h.connector,
					columnAlias:h.columnAlias,
					operator:h.operator,
					value:h.value
				})),
				orders:this.inputs.viewDefinitionOrders.map(o => ({
					columnAlias:o.columnAlias,
					direction:o.direction
				}))
			};
		},
		addViewDefinitionColumn() {
			if(!this.viewDefinitionCanAddColumn)
				return;
			const rel = this.viewDefinitionColumnRelations[0];
			const atr = rel.attributes.find(a => a.name === 'id') || rel.attributes[0];
			this.inputs.viewDefinitionColumns.push({
				relationId:rel.id,
				attributeId:atr.id,
				alias:this.getViewDefinitionColumnAlias(atr,'',''),
				aggregate:'',
				function:'',
				fallback:''
			});
		},
		addViewDefinitionJoin() {
			const rels = this.viewDefinitionJoinRelations(this.inputs.viewDefinitionJoins.length);
			if(rels.length === 0)
				return;
			const attrs = this.viewDefinitionJoinAttributes({relationId:rels[0].id},this.inputs.viewDefinitionJoins.length);
			this.inputs.viewDefinitionJoins.push({
				relationId:rels[0].id,
				attributeId:attrs.length === 0 ? '' : attrs[0].id,
				required:false
			});
		},
		addViewDefinitionFilter() {
			if(!this.viewDefinitionCanAddFilter)
				return;
			const rel = this.viewDefinitionColumnRelations[0];
			const atr = rel.attributes.find(a => a.name !== 'id') || rel.attributes[0];
			this.inputs.viewDefinitionFilters.push({
				connector:'AND',
				relationId:rel.id,
				attributeId:atr.id,
				function:'',
				fallback:'',
				operator:'=',
				value:''
			});
		},
		addViewDefinitionHaving() {
			if(!this.viewDefinitionCanAddHaving)
				return;
			this.inputs.viewDefinitionHavings.push({
				connector:'AND',
				columnAlias:this.viewDefinitionOutputColumns[0].alias,
				operator:'=',
				value:''
			});
		},
		addViewDefinitionOrder() {
			if(!this.viewDefinitionCanAddOrder)
				return;
			this.inputs.viewDefinitionOrders.push({
				columnAlias:this.viewDefinitionOutputColumns[0].alias,
				direction:'ASC'
			});
		},
		fillViewDefinitionColumnAlias(column) {
			const atr = this.viewDefinitionColumnAttributes(column).find(a => a.id === column.attributeId);
			if(atr !== undefined && column.alias === '')
				column.alias = this.getViewDefinitionColumnAlias(atr,column.aggregate,column.function);
		},
		getViewDefinitionColumnAlias(attribute,aggregate,fnc) {
			let parts = [];
			if(aggregate !== '')
				parts.push(aggregate);
			if(fnc !== '')
				parts.push(fnc);
			parts.push(attribute.name);
			return parts.join('_');
		},
		appendViewSqlToken(token) {
			const prefix = this.inputs.viewSql === '' || this.inputs.viewSql.endsWith('\n') ? '' : ' ';
			this.inputs.viewSql = `${this.inputs.viewSql}${prefix}${token}`;
		},
		getPickedViewSqlToken() {
			if(this.viewTokenKind === 'REL') {
				const mod = this.viewTokenModule;
				const rel = this.viewTokenRelations.find(v => v.id === this.viewTokenRelationId);
				return mod === false || rel === undefined ? '' : `{REL:${mod.name}.${rel.name}}`;
			}
			if(this.viewTokenKind === 'ATR') {
				const mod = this.viewTokenModule;
				const rel = this.viewTokenRelations.find(v => v.id === this.viewTokenRelationId);
				const atr = this.viewTokenAttributes.find(v => v.id === this.viewTokenAttributeId);
				return mod === false || rel === undefined || atr === undefined
					? '' : `{ATR:${mod.name}.${rel.name}.${atr.name}}`;
			}
			if(this.viewTokenKind === 'PGF') {
				const mod = this.viewTokenModule;
				const fnc = this.viewTokenPgFunctions.find(v => v.id === this.viewTokenPgFunctionId);
				return mod === false || fnc === undefined ? '' : `{PGF:${mod.name}.${fnc.name}}`;
			}
			return '';
		},
		resetViewTokenPicker() {
			if(this.modules.length === 0)
				return;
			if(this.viewTokenModuleId === '' || this.moduleIdMap[this.viewTokenModuleId] === undefined)
				this.viewTokenModuleId = this.moduleId;

			if(this.viewTokenRelations.length !== 0 &&
				(this.viewTokenRelationId === '' || !this.viewTokenRelations.some(v => v.id === this.viewTokenRelationId))) {

				this.viewTokenRelationId = this.viewTokenRelations[0].id;
			}
			if(this.viewTokenAttributes.length !== 0 &&
				(this.viewTokenAttributeId === '' || !this.viewTokenAttributes.some(v => v.id === this.viewTokenAttributeId))) {

				this.viewTokenAttributeId = this.viewTokenAttributes[0].id;
			}
			if(this.viewTokenPgFunctions.length !== 0 &&
				(this.viewTokenPgFunctionId === '' || !this.viewTokenPgFunctions.some(v => v.id === this.viewTokenPgFunctionId))) {

				this.viewTokenPgFunctionId = this.viewTokenPgFunctions[0].id;
			}
		},
		relationIdByInput(id) {
			for(const mod of this.modules) {
				const rel = mod.relations.find(r => r.id === id);
				if(rel !== undefined)
					return rel;
			}
			return false;
		},
		removeViewDefinitionColumn(pos) {
			const alias = this.inputs.viewDefinitionColumns[pos].alias;
			this.inputs.viewDefinitionColumns.splice(pos,1);
			this.inputs.viewDefinitionHavings = this.inputs.viewDefinitionHavings.filter(h => h.columnAlias !== alias);
			this.inputs.viewDefinitionOrders = this.inputs.viewDefinitionOrders.filter(o => o.columnAlias !== alias);
		},
		removeViewDefinitionFilter(pos) {
			this.inputs.viewDefinitionFilters.splice(pos,1);
		},
		removeViewDefinitionHaving(pos) {
			this.inputs.viewDefinitionHavings.splice(pos,1);
		},
		removeViewDefinitionJoin(pos) {
			const relId = this.inputs.viewDefinitionJoins[pos].relationId;
			this.inputs.viewDefinitionJoins.splice(pos,1);
			this.inputs.viewDefinitionColumns = this.inputs.viewDefinitionColumns.filter(c => c.relationId !== relId);
			this.inputs.viewDefinitionFilters = this.inputs.viewDefinitionFilters.filter(f => f.relationId !== relId);
		},
		removeViewDefinitionOrder(pos) {
			this.inputs.viewDefinitionOrders.splice(pos,1);
		},
		resetViewDefinitionColumn(pos) {
			const column = this.inputs.viewDefinitionColumns[pos];
			const attrs = this.viewDefinitionColumnAttributes(column);
			column.attributeId = attrs.length === 0 ? '' : attrs[0].id;
			column.function = '';
			column.fallback = '';
			column.alias = attrs.length === 0 ? '' : this.getViewDefinitionColumnAlias(attrs[0],column.aggregate,column.function);
		},
		resetViewDefinitionJoin(pos) {
			const join = this.inputs.viewDefinitionJoins[pos];
			const attrs = this.viewDefinitionJoinAttributes(join,pos);
			join.attributeId = attrs.length === 0 ? '' : attrs[0].id;
		},
		resetViewDefinitionFilter(pos) {
			const filter = this.inputs.viewDefinitionFilters[pos];
			const attrs = this.viewDefinitionColumnAttributes(filter);
			filter.attributeId = attrs.length === 0 ? '' : attrs[0].id;
			filter.function = '';
			filter.fallback = '';
		},
		resetViewQueryDesigner() {
			if(this.module === undefined || this.module.relations.length === 0)
				return;
			if(this.inputs.viewQueryBaseRelationId === '' ||
				!this.module.relations.some(r => r.id === this.inputs.viewQueryBaseRelationId)) {

				this.inputs.viewQueryBaseRelationId = this.module.relations[0].id;
			}
			if(this.inputs.viewDefinitionColumns.length === 0) {
				const idAtr = this.viewQueryBaseAttributes.find(a => a.name === 'id');
				const titleAtr = this.viewQueryBaseAttributes.find(a => a.name !== 'id');
				if(idAtr !== undefined) {
					this.inputs.viewDefinitionColumns.push({
						relationId:this.inputs.viewQueryBaseRelationId,
						attributeId:idAtr.id,
						alias:'id',
						aggregate:'',
						function:'',
						fallback:''
					});
				}
				if(titleAtr !== undefined) {
					this.inputs.viewDefinitionColumns.push({
						relationId:this.inputs.viewQueryBaseRelationId,
						attributeId:titleAtr.id,
						alias:titleAtr.name,
						aggregate:'',
						function:'',
						fallback:''
					});
				}
			}
			for(let i = 0; i < this.inputs.viewDefinitionJoins.length; i++)
				this.resetViewDefinitionJoin(i);
			for(let i = 0; i < this.inputs.viewDefinitionColumns.length; i++) {
				const column = this.inputs.viewDefinitionColumns[i];
				if(!this.viewDefinitionColumnRelations.some(r => r.id === column.relationId))
					column.relationId = this.inputs.viewQueryBaseRelationId;
				if(!this.viewDefinitionColumnAttributes(column).some(a => a.id === column.attributeId))
					this.resetViewDefinitionColumn(i);
				if(column.function === undefined)
					column.function = '';
				if(column.fallback === undefined)
					column.fallback = '';
				this.viewDefinitionColumnFunctionChanged(column);
			}
			for(let i = 0; i < this.inputs.viewDefinitionFilters.length; i++) {
				const filter = this.inputs.viewDefinitionFilters[i];
				if(!this.viewDefinitionColumnRelations.some(r => r.id === filter.relationId))
					filter.relationId = this.inputs.viewQueryBaseRelationId;
				if(!this.viewDefinitionColumnAttributes(filter).some(a => a.id === filter.attributeId))
					this.resetViewDefinitionFilter(i);
				if(filter.function === undefined)
					filter.function = '';
				if(filter.fallback === undefined)
					filter.fallback = '';
				if(filter.operator === undefined || filter.operator === '')
					filter.operator = '=';
				this.viewDefinitionColumnFunctionChanged(filter);
			}
			this.inputs.viewDefinitionHavings = this.inputs.viewDefinitionHavings.filter(h => this.viewDefinitionOutputColumns.some(c => c.alias === h.columnAlias));
			this.inputs.viewDefinitionOrders = this.inputs.viewDefinitionOrders.filter(o => this.viewDefinitionOutputColumns.some(c => c.alias === o.columnAlias));
		},
		viewDefinitionAvailableTargetRelationIds(pos) {
			const out = [this.inputs.viewQueryBaseRelationId];
			for(let i = 0; i < pos; i++) {
				const relId = this.inputs.viewDefinitionJoins[i].relationId;
				if(relId !== '' && !out.includes(relId))
					out.push(relId);
			}
			return out;
		},
		viewDefinitionColumnAttributes(column) {
			const rel = this.relationIdByInput(column.relationId);
			return rel === false ? [] : rel.attributes;
		},
		viewDefinitionColumnFunctions(column) {
			const atr = this.viewDefinitionColumnAttributes(column).find(a => a.id === column.attributeId);
			const out = [
				{ value:'', label:'Value' },
				{ value:'coalesce', label:'COALESCE' }
			];
			if(atr === undefined)
				return out;

			if(['date','datetime'].includes(atr.contentUse))
				out.push(
					{ value:'year', label:'Year' },
					{ value:'quarter', label:'Quarter' },
					{ value:'month', label:'Month' },
					{ value:'week', label:'Week' },
					{ value:'day', label:'Day' },
					{ value:'dow', label:'Day of week' }
				);
			if(atr.contentUse === 'datetime')
				out.push(
					{ value:'hour', label:'Hour' },
					{ value:'minute', label:'Minute' }
				);
			else if(atr.contentUse === 'time')
				out.push(
					{ value:'hour', label:'Hour' },
					{ value:'minute', label:'Minute' }
				);

			if(['varchar','text'].includes(atr.content))
				out.push(
					{ value:'lower', label:'Lower' },
					{ value:'upper', label:'Upper' },
					{ value:'trim', label:'Trim' },
					{ value:'length', label:'Length' }
				);

			if(atr.contentUse === 'default' && ['integer','bigint','numeric','real','double precision'].includes(atr.content))
				out.push(
					{ value:'round', label:'Round' },
					{ value:'abs', label:'Absolute' }
				);

			return out;
		},
		viewDefinitionColumnFunctionChanged(column) {
			if(!this.viewDefinitionColumnFunctions(column).some(f => f.value === column.function))
				column.function = '';
			if(column.function !== 'coalesce')
				column.fallback = '';
			this.fillViewDefinitionColumnAlias(column);
		},
		viewDefinitionOperatorNeedsNoValue(operator) {
			return ['IS NULL','IS NOT NULL'].includes(operator);
		},
		viewDefinitionJoinAttributes(join,pos) {
			const rel = this.relationIdByInput(join.relationId);
			if(rel === false)
				return [];
			const targetIds = this.viewDefinitionAvailableTargetRelationIds(pos);
			const out = rel.attributes.filter(a => ['1:1','n:1'].includes(a.content) && targetIds.includes(a.relationshipId));
			for(const targetId of targetIds) {
				const targetRel = this.relationIdByInput(targetId);
				if(targetRel === false)
					continue;
				for(const atr of targetRel.attributes) {
					if(['1:1','n:1'].includes(atr.content) && atr.relationshipId === rel.id && !out.some(a => a.id === atr.id))
						out.push(atr);
				}
			}
			return out;
		},
		viewDefinitionJoinAttributeLabel(attribute) {
			const rel = this.relationIdByInput(attribute.relationId);
			return rel === false ? attribute.name : `${rel.name}.${attribute.name}`;
		},
		viewDefinitionJoinRelations(pos) {
			const targetIds = this.viewDefinitionAvailableTargetRelationIds(pos);
			const joinedIds = this.inputs.viewDefinitionJoins.slice(0,pos).map(j => j.relationId);
			return this.module.relations.filter(r =>
				!targetIds.includes(r.id) &&
				!joinedIds.includes(r.id) &&
				(
					r.attributes.some(a => ['1:1','n:1'].includes(a.content) && targetIds.includes(a.relationshipId)) ||
					targetIds.some(targetId => {
						const targetRel = this.relationIdByInput(targetId);
						return targetRel !== false && targetRel.attributes.some(a => ['1:1','n:1'].includes(a.content) && a.relationshipId === r.id);
					})
				)
			);
		},
		
		// backend calls
		set() {
			if(!this.canSave) return;
			
			let action = 'set';
			let request;
			let dependencyCheck = false;
			switch(this.entity) {
				case 'api':	       request = this.getTemplateApi(this.module.id,this.inputs.name); break;
				case 'collection': request = this.getTemplateCollection(this.module.id,this.inputs.name); break;
				case 'jsFunction': request = this.getTemplateJsFunction(this.moduleId,this.inputs.formId,this.inputs.name); break;
				case 'module':     request = this.getTemplateModule(this.inputs.name); break;
				case 'pgFunction': request = this.getTemplatePgFunction(this.moduleId,this.inputs.name,this.inputs.template,this.inputs.isTrigger); break;
				case 'relation':
					request = this.getTemplateRelation(this.module.id,this.inputs.name,this.inputs.encryption,
						this.inputs.view ? {
							hasId:this.inputs.viewHasId,
							managed:this.inputs.viewManaged,
							sql:this.inputs.viewManaged && this.inputs.viewMode === 'sql' ? this.inputs.viewSql : null,
							sqlTemplate:this.inputs.viewManaged && this.inputs.viewMode === 'sql' ? this.inputs.viewSql : null,
							definition:this.inputs.viewManaged && this.inputs.viewMode === 'definition' ? this.buildRelationViewDefinition() : null
						} : null
					);
				break;
				case 'role':       request = this.getTemplateRole(this.moduleId,this.inputs.name); break;
				case 'searchBar':  request = this.getTemplateSearchBar(this.moduleId,this.inputs.name); break;
				case 'variable':   request = this.getTemplateVariable(this.moduleId,this.inputs.formId,this.inputs.name); break;
				case 'widget':     request = this.getTemplateWidget(this.moduleId,this.inputs.name); break;
				case 'doc':        
					if(this.inputs.docIdDuplicate !== '') {
						action = 'copy';
						request = {
							id:this.inputs.docIdDuplicate,
							moduleId:this.moduleId,
							newName:this.inputs.name
						};
						dependencyCheck = true;
					} else {
						request = this.getTemplateDoc(this.module.id,this.builderLanguage,this.inputs.name);
					}
				break;
				case 'form':
					if(this.inputs.formIdDuplicate !== null) {
						action = 'copy';
						request = {
							id:this.inputs.formIdDuplicate,
							moduleId:this.moduleId,
							newName:this.inputs.name
						};
						dependencyCheck = true;
					} else {
						request = this.getTemplateForm(this.moduleId,this.inputs.name);
					}
				break;
				default: return; break;
			}
			
			let requests = [ws.prepare(this.entity,action,request)];
			
			if(dependencyCheck)
				requests.push(ws.prepare('schema','check',{moduleId:this.moduleId}));
			
			ws.sendMultiple(requests,true).then(
				res => {
					if(this.entity === 'module') this.$root.schemaReload(res[0].payload);
					else                         this.$root.schemaReload(this.moduleId);
					
					this.$emit('close');
				},
				this.$root.genericError
			);
		}
	}
};
