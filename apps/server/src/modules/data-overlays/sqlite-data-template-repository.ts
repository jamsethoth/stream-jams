import { dataTemplateSchema, dataTemplateCatalogSchema, bundledDataTemplates, type DataTemplate, type DataTemplateRepository } from "@stream-jams/core";
import { runInTransaction, type StreamJamsDatabase } from "../db/database.js";

export class SqliteDataTemplateRepository implements DataTemplateRepository {
  constructor(private readonly database: StreamJamsDatabase) {}
  read(): DataTemplate[] {
    const templates = this.database.connection.prepare("SELECT id,name_key,document FROM data_templates ORDER BY rowid").all().map(row => {
      const template = dataTemplateSchema.parse(JSON.parse(String(row.document)) as unknown);
      if (template.origin !== "user" || row.id !== template.id || row.name_key !== template.name.trim().toLowerCase()) throw new TypeError("Invalid saved data template identity");
      return template;
    });
    dataTemplateCatalogSchema.parse({ templates: [...bundledDataTemplates, ...templates] }); return templates;
  }
  mutate(work: (draft: DataTemplate[]) => void): DataTemplate[] {
    return runInTransaction(this.database.connection, () => {
      const templates = this.read(); work(templates);
      const saved = templates.map(template => dataTemplateSchema.parse(template));
      if (saved.some(template => template.origin !== "user")) throw new TypeError("Only user templates may be persisted");
      dataTemplateCatalogSchema.parse({ templates: [...bundledDataTemplates, ...saved] });
      this.database.connection.exec("DELETE FROM data_templates");
      const insert = this.database.connection.prepare("INSERT INTO data_templates VALUES (?,?,?)");
      for (const template of saved) insert.run(template.id,template.name.trim().toLowerCase(),JSON.stringify(template));
      return saved;
    });
  }
}
